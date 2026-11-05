// One-time, read-only source exporter. Run with the old installation's mongosh,
// never from the Frame runtime. Supply URI/database/output through private env.
const fs = require('node:fs');
const crypto = require('node:crypto');
const uri = process.env.FRAME_LEGACY_SOURCE_URI;
const name = process.env.FRAME_LEGACY_SOURCE_DATABASE;
const output = process.env.FRAME_LEGACY_ARCHIVE;
if (!uri || !name || !output) throw new Error('Set source URI, database, and private output path in the environment.');
const connection = new Mongo(uri);
const session = connection.startSession({ causalConsistency: false });
const source = session.getDatabase(name);
const resources = ['users','workspaces','members','folders','decks','revisions','assets','sources','themes','brandKits','compositions','creationDrafts','agentPreferences','jobs','jobQuotas','generationSteps','jobApplications','outbox','publications','publicationEditions','publicationAssets','exportRequests','collaborators','comments','liveSessions','liveParticipants','liveResponses','presentationCredits','presentationCreditChanges','errorEvents','deletionTombstones'];
const large = { jobs:['payload','result'], creationDrafts:['data'], sources:['text'], compositions:['elements'], themes:['data'], brandKits:['data'] };
const numeric = new Set(['expiresAt','leaseUntil','availableAt','lastSeen','cancelRequestedAt']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function content(id) {
  const root = source.contentManifests.findOne({_id:id}); if (!root) throw new Error('Missing content manifest.');
  const parts = root.chunkIds.map((key,ordinal) => {
    const chunk = source.contentChunks.findOne({_id:key,manifestId:id,ordinal});
    if (!chunk) throw new Error('Missing content chunk.');
    return Buffer.from(chunk.bytes.buffer);
  });
  const bytes = Buffer.concat(parts);
  if (bytes.length !== root.byteLength || sha(bytes) !== root.hash) throw new Error('Source content failed integrity verification.');
  return bytes.toString('utf8');
}
function normalize(row) {
  const result = {...row, id:String(row._id)}; delete result._id;
  for (const [key,value] of Object.entries(result)) if (value instanceof Date) result[key] = numeric.has(key) ? value.getTime() : value.toISOString();
  return result;
}
try {
  const sourceCollections = source.getCollectionNames();
  session.startTransaction({readConcern:{level:'snapshot'}});
  const archive = { version:1, resources:{}, snapshots:[], historical:{} };
  const expected = new Set([...resources,'snapshots','contentManifests','contentChunks','authIdentities','erxesIdentities','erxesDeployment','erxesSessions','erxesTickets','schemaMigrations','presence','liveParticipants','liveResponses','rateLimits','operationLeases','workerHeartbeats','backupRoots']);
  for (const c of sourceCollections) if (!expected.has(c) && source.getCollection(c).countDocuments({}) > 0) throw new Error('Unknown nonempty source collection; add an explicit preservation mapping before exporting.');
  for (const table of resources) {
    archive.resources[table] = source.getCollection(table).find({}).toArray().map(input => {
      const row = normalize(input);
      for (const field of large[table] || []) {
        if (row[field+'ContentId']) row[field] = content(row[field+'ContentId']);
        delete row[field+'ContentId'];
      }
      if (['publications','liveSessions'].includes(table)) delete row.document;
      return row;
    });
  }
  archive.resources.legacyIdentities = [];
  for (const table of ['authIdentities','erxesIdentities']) for (const input of source.getCollection(table).find({}).toArray()) {
    const row = normalize(input);
    archive.resources.legacyIdentities.push({id:row.id,userId:row.userId,provider:row.provider || 'legacy-host',issuer:row.issuer || row.tenant,subject:row.subject});
  }
  for (const root of source.snapshots.find({}).toArray()) {
    const metadata = JSON.parse(content(root.metadataContentId));
    const slides = root.slideRefs.map(ref => {const slide=JSON.parse(content(ref.contentId)); if(slide.id!==ref.id)throw new Error('Mismatched slide reference.'); return slide;});
    archive.snapshots.push({id:String(root._id),document:{...metadata,slides}});
  }
  // Retain historical bindings and source migration records in the private archive.
  for (const table of ['erxesDeployment','schemaMigrations','backupRoots']) archive.historical[table] = source.getCollection(table).find({}).toArray().map(normalize);
  fs.writeFileSync(output, JSON.stringify(archive), {mode:0o600,flag:'wx'});
  print('Private archive exported. The source database was not changed.');
} finally { if (session.inTransaction()) session.abortTransaction(); session.endSession(); connection.close(); }

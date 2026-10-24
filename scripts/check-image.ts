// Verify the shipped runtime without database/cloud credentials or networking.
const engine = process.env.FRAME_CONTAINER_ENGINE || "podman";
const image = process.argv[2] || "localhost/frame:verified";
const name = "frame-image-check-" + crypto.randomUUID();
const program = `
import assert from "node:assert/strict";
import { makeDocument, layoutSlide } from "./shared/templates";
import { publicProjection } from "./shared/publications";
import { renderExport } from "./server/render-export";
import { unzipSync } from "fflate";
assert.notEqual(process.getuid(), 0, "The runtime must be unprivileged.");
const doc=makeDocument("image-check", "image-check", "Container verification", "blank");
doc.slides=[layoutSlide("title", "A working container"),layoutSlide("process", "Editable ideas, consistent output")];
const projected=publicProjection(doc,id=>id);
for(const format of ["pdf","images","html","pptx"]){
 const output=await renderExport(projected,{},format,1,{signal:AbortSignal.timeout(120000),progress:()=>{}});
 assert(output.bytes.length>1000);
 if(format==="pdf")assert.equal(Buffer.from(output.bytes).subarray(0,5).toString(),"%PDF-");
 if(format==="images")assert.equal(Object.keys(unzipSync(output.bytes)).filter(k=>k.endsWith(".png")).length,2);
 if(format==="html")assert(Buffer.from(output.bytes).toString().includes("frame-model"));
 if(format==="pptx")assert("ppt/presentation.xml" in unzipSync(output.bytes));
 console.log(JSON.stringify({format,bytes:output.bytes.length,mime:output.mime,uid:process.getuid()}));
}
`;
const child = Bun.spawn(
  [
    engine,
    "run",
    "--rm",
    "--network",
    "none",
    "--name",
    name,
    image,
    "bun",
    "-e",
    program,
  ],
  { stdout: "inherit", stderr: "inherit" },
);
const timer = setTimeout(() => child.kill("SIGTERM"), 180000);
try {
  process.exitCode = await child.exited;
} finally {
  clearTimeout(timer);
  await Bun.spawn([engine, "rm", "--force", name], {
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
}
export {};

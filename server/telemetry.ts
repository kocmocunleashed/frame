/** CloudWatch Embedded Metric Format: values only, never document contents. */
export function metric(name: string, value: number, unit = "Count") {
  if (process.env.NODE_ENV !== "production") return;
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Frame",
            Dimensions: [["Environment"]],
            Metrics: [{ Name: name, Unit: unit }],
          },
        ],
      },
      Environment: process.env.FRAME_ENVIRONMENT || "unknown",
      [name]: value,
    }),
  );
}
export function operationalEvent(
  event: string,
  fields: Record<string, string | number | boolean> = {},
) {
  console.log(
    JSON.stringify({ event, ...fields, time: new Date().toISOString() }),
  );
}

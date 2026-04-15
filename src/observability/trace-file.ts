export function createTraceFileName(
  pipelineName: string,
  when: Date = new Date(),
  pid: number = process.pid,
): string {
  const timestamp = when.toISOString().replaceAll(":", "-").replace(".", "-");
  return `${pipelineName}-${timestamp}-${pid}.json`;
}

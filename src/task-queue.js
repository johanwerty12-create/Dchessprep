// Writes for the same source must observe the preceding completed write.
export function createSerialTaskQueue() {
  const jobs = new Map();
  return (key, work) => {
    const previous = jobs.get(key) || Promise.resolve();
    const job = previous.catch(() => {}).then(work);
    const result = job.finally(() => { if (jobs.get(key) === result) jobs.delete(key); });
    jobs.set(key, result);
    return result;
  };
}

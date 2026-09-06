import { task } from "@trigger.dev/sdk";

export const helloWorld = task("hello-world", async () => {
  console.log("hello world from trigger.dev dev mode");
  return { ok: true };
});

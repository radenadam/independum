import { Hono } from "hono";
import { expect, test } from "vitest";
import { followEventStream } from "./follow-event-stream.ts";
import { streamEvents } from "./stream-events.ts";

test("events during a snapshot arrive after it and release the subscription", async () => {
  let finishSnapshot = (_events: string[]): void => undefined;
  const snapshot = new Promise<string[]>((resolve) => {
    finishSnapshot = resolve;
  });
  let listener = (_event: string): void => undefined;
  let isFollowing = false;
  const routes = new Hono();
  routes.get("/events", (context) =>
    streamEvents(
      context,
      () => snapshot,
      (next) => {
        listener = next;
        isFollowing = true;
        return () => {
          isFollowing = false;
        };
      },
      (event) => event === "end",
    ),
  );
  const response = await routes.request("/events");
  expect(isFollowing).toBe(true);
  listener("reply ended");
  finishSnapshot(["snapshot"]);
  const events = followEventStream<string>(response);
  expect(await events.next()).toBe("snapshot");
  expect(await events.next()).toBe("reply ended");
  listener("end");
  expect(await events.next()).toBe("end");
  expect(isFollowing).toBe(false);
  await events.close();
});

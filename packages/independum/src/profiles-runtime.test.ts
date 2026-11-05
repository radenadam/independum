import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { addedFactTexts } from "./added-facts.ts";
import type { ProfileBundle, ProfileReference } from "./api-types.ts";
import { createChat, type OpenChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const folder = createTestFolder("profile-runtime");
let nextId = 0;

async function setup() {
  nextId += 1;
  const { directory, project } = createTestProject(folder);
  const models = await createModelRuntime(directory);
  const faux = fauxProvider({
    provider: `profile-test-${nextId}`,
    models: [{ id: "model", reasoning: true }],
  });
  models.registerNativeProvider(faux.provider);
  await models.setRuntimeApiKey(faux.provider.id, "test-key");
  const chats = await createChat({ models, directory, folder: project });
  const projectId = chats.profiles.projects()[0]?.id ?? "";
  const reference: ProfileReference = { scope: "user", id: "default" };
  const profile: ProfileBundle = {
    profile: {
      formatVersion: 1,
      name: "Research",
      settings: {
        model: { providerId: faux.provider.id, modelId: "model" },
        disabledFacts: addedFactTexts.map((text) => text.id),
        compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
      },
    },
    systemPrompt: "The research prompt.",
    modelTexts: null,
  };
  await chats.profiles.putProfile(
    reference,
    projectId,
    profile,
    chats.profiles.profile(reference, projectId).revision,
  );
  const chat = await chats.open(await chats.first());
  if (chat === undefined) {
    throw new Error("The profile test chat did not open.");
  }
  return { chats, chat, faux, profile, reference, projectId, directory, models, project };
}

async function reply(chat: OpenChat, text: string): Promise<void> {
  const finished = Promise.withResolvers<void>();
  const stop = chat.subscribe((event) => {
    if (event.type === "replying" && !event.isReplying) {
      finished.resolve();
    }
  });
  try {
    expect(await chat.send(text)).toBe(true);
    await finished.promise;
  } finally {
    stop();
  }
}

test("independent profiles reach requests and a chat keeps its saved reference after restart", async () => {
  const { chats, chat, faux, profile, projectId, directory, models, project } = await setup();
  const other: ProfileReference = { scope: "project", id: "research" };
  await chats.profiles.putProfile(
    other,
    projectId,
    {
      ...profile,
      profile: { ...profile.profile, name: "Other research" },
      systemPrompt: "The other prompt.",
    },
    "*",
  );
  const original: string[] = [];
  faux.setResponses([
    (context) => {
      original.push(JSON.stringify(context));
      return fauxAssistantMessage("First answer.");
    },
  ]);
  await reply(chat, "First question");
  await chats.profiles.putProject(
    projectId,
    { formatVersion: 1, profile: other },
    chats.profiles.project(projectId).revision,
  );
  const nextId = await chats.startNew(chat.getState().id);
  const next = nextId === undefined ? undefined : await chats.open(nextId);
  if (next === undefined) {
    throw new Error("The other profile chat did not open.");
  }
  faux.setResponses([
    (context) => {
      original.push(JSON.stringify(context));
      return fauxAssistantMessage("Other answer.");
    },
  ]);
  await reply(next, "Other question");
  expect(original[0]).toContain("The research prompt.");
  expect(original[0]).not.toContain("The other prompt.");
  expect(original[1]).toContain("The other prompt.");
  expect(original[0]).not.toContain("profiles\\");
  expect(original[0]).not.toContain("independum-profile");
  expect(chat.getAgent().configuration?.profile.reference.scope).toBe("user");
  await chats.stopAll();
  const restarted = await createChat({ models, directory, folder: project });
  try {
    const restored = await restarted.open(chat.getState().id);
    expect(restored?.getAgent().configuration?.profile.reference).toEqual({
      scope: "user",
      id: "default",
    });
    expect(restored?.getState().model?.id).toBe("model");
  } finally {
    await restarted.stopAll();
  }
});

test("a profile edit stays pending for every turn and tool result until the reply settles", async () => {
  const { chats, chat, faux, profile, reference, projectId, project } = await setup();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const requests: string[] = [];
  faux.setResponses([
    async (context) => {
      requests.push(JSON.stringify(context));
      entered.resolve();
      await release.promise;
      return fauxAssistantMessage([fauxToolCall("Read", { path: "missing-profile-file" })], {
        stopReason: "toolUse",
      });
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("Finished.");
    },
  ]);
  const finished = reply(chat, "Hold this reply");
  await entered.promise;
  const path = chats.profiles.profile(reference, projectId).path;
  writeFileSync(join(path, "SYSTEM.md"), "The edited prompt.");
  writeFileSync(
    join(path, "model-texts.json"),
    JSON.stringify({
      formatVersion: 1,
      texts: { "read.description": { text: "The edited Read declaration." } },
    }),
  );
  await chats.reconcile();
  expect(chat.getAgent().configuration?.pendingRevision).not.toBeNull();
  expect(chat.getAgent().systemPrompt).toBe(profile.systemPrompt);
  release.resolve();
  await finished;
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request).not.toContain("The edited prompt.");
    expect(request).not.toContain("The edited Read declaration.");
  }
  await chats.reconcile();
  expect(chat.getAgent().systemPrompt).toBe("The edited prompt.");
  faux.setResponses([
    (context) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("New setup.");
    },
  ]);
  await reply(chat, "Use the edited setup");
  expect(requests[2]).toContain("The edited prompt.");
  expect(requests[2]).toContain("The edited Read declaration.");
  expect(chats.profiles.resolve(chat.getState().id, project).issues).toEqual([]);
  await chats.stopAll();
});

test("invalid external files block dependent work and preserve the last applied setup", async () => {
  const { chats, chat, faux, reference, projectId } = await setup();
  const path = join(chats.profiles.profile(reference, projectId).path, "profile.json");
  writeFileSync(path, '{"formatVersion":1,"name":"Broken","settings":{"shell":"fish"}}');
  expect(await chat.send("Do not start")).toBe(false);
  expect(await chat.compact()).toBe(false);
  expect(faux.state.callCount).toBe(0);
  expect(chat.getAgent().systemPrompt).toBe("The research prompt.");
  expect(chat.getAgent().configuration?.issues[0]?.pointer).toBe("/settings/shell");
  await chats.stopAll();
});

test("configuration routes enforce strict json and conditional saves", async () => {
  const { chats, chat, models, profile, projectId } = await setup();
  const routes = createChatRoutes(chats, models);
  const path = `/profiles/user/default?projectId=${projectId}`;
  const current = await routes.request(path);
  const revision = current.headers.get("etag") ?? "";
  function put(body: string, expected?: string): Promise<Response> {
    return Promise.resolve(
      routes.request(path, {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/json",
          ...(expected === undefined ? {} : { "If-Match": expected }),
        },
      }),
    );
  }
  expect((await put(JSON.stringify(profile))).status).toBe(428);
  expect(
    (
      await put(
        '{"profile":{"formatVersion":1,"name":"First","name":"Second"},"systemPrompt":null,"modelTexts":null}',
        revision,
      )
    ).status,
  ).toBe(400);
  const invalid = await put(
    JSON.stringify({
      ...profile,
      profile: { ...profile.profile, settings: { outputLimits: { maxLines: 1, maxBytes: 5000 } } },
    }),
    revision,
  );
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toMatchObject({
    issues: [
      {
        pointer: "/settings/outputLimits/maxLines",
        message: "Expected an integer from 10 through 1000000.",
      },
    ],
  });
  expect(
    (await put(JSON.stringify({ ...profile, systemPrompt: "Changed." }), revision)).status,
  ).toBe(200);
  expect((await put(JSON.stringify(profile), revision)).status).toBe(412);
  const legacy = await routes.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: '{"shell":"bash"}',
  });
  expect(legacy.status).toBe(422);
  expect(chat.getAgent().systemPrompt).toBe("Changed.");
  await chats.stopAll();
});

test("switching a chat profile clears explicit choices and resolves the new effort", async () => {
  const { chats, chat, models, faux, profile, projectId } = await setup();
  await chat.chooseModel(faux.provider.id, "model");
  await chat.chooseThinking("high");
  const other: ProfileReference = { scope: "user", id: "other" };
  await chats.profiles.putProfile(
    other,
    projectId,
    {
      ...profile,
      profile: {
        ...profile.profile,
        name: "Other",
        settings: { ...profile.profile.settings, thinkingLevel: "low" },
      },
    },
    "*",
  );
  const choices = chats.profiles.choices(chat.getState().id);
  expect(choices.document?.overrides?.thinkingLevel).toBe("high");
  const routes = createChatRoutes(chats, models);
  const response = await routes.request(`/chats/${chat.getState().id}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", "If-Match": choices.revision },
    body: JSON.stringify({
      formatVersion: 1,
      profile: other,
      overrides: { thinkingLevel: "high" },
    }),
  });
  expect(response.status).toBe(200);
  expect(chats.profiles.choices(chat.getState().id).document?.overrides).toBeUndefined();
  expect(chat.getState().thinking?.level).toBe("low");
  await chats.stopAll();
});

test("an empty system file removes the owned preamble and disabled tools from the request", async () => {
  const { chats, chat, faux, profile, reference, projectId } = await setup();
  await chats.profiles.putProfile(
    reference,
    projectId,
    {
      ...profile,
      systemPrompt: "",
      profile: {
        ...profile.profile,
        settings: { ...profile.profile.settings, disabledTools: ["Read"] },
      },
    },
    chats.profiles.profile(reference, projectId).revision,
  );
  let request = "";
  faux.setResponses([
    (context) => {
      request = JSON.stringify(context);
      return fauxAssistantMessage("Empty prompt received.");
    },
  ]);
  await reply(chat, "Inspect the setup");
  expect(request).not.toContain("The research prompt.");
  expect(request).not.toContain("You are an agent working");
  expect(request).not.toContain("coding assistant");
  expect(request).not.toContain('"name":"Read"');
  expect(request).toContain('"name":"Write"');
  await chats.stopAll();
});

import { type Context, Hono } from "hono";
import type { ProfileReference } from "./api-types.ts";
import { ConfigurationError, parseConfigurationJson } from "./configuration-schema.ts";
import type { Chat } from "./create-chat.ts";
import { readSettingsChange } from "./read-settings-change.ts";

/** Creates routes for explicitly addressed settings files and profile bundles. */
export function createProfileRoutes(chat: Chat): Hono {
  const routes = new Hono();
  const store = chat.profiles;
  routes.onError(configurationErrorResponse);
  routes.get("/settings", (context) => resource(context, store.user()));
  routes.put("/settings", async (context) => {
    await store.putUser(await bodyOf(context), revisionOf(context));
    await chat.reconcile();
    return resource(context, store.user());
  });
  routes.get("/projects/:projectId/settings", (context) =>
    resource(context, store.project(context.req.param("projectId"))),
  );
  routes.put("/projects/:projectId/settings", async (context) => {
    const projectId = context.req.param("projectId");
    await store.putProject(projectId, await bodyOf(context), revisionOf(context));
    return resource(context, store.project(projectId));
  });
  routes.get("/profiles", (context) => {
    const projectId = projectOf(context);
    const profiles = store.profiles(projectId).map((profile) =>
      profile.document === null
        ? profile
        : {
            ...profile,
            issues:
              chat.profileAgent(profile.reference, projectId).configuration?.issues ??
              profile.issues,
          },
    );
    return context.json({
      profiles,
      user: store.user(),
      project: store.project(projectId),
      projects: store.projects(),
    });
  });
  routes.get("/profiles/:scope/:profileId", (context) =>
    resource(context, store.profile(referenceOf(context), projectOf(context))),
  );
  routes.get("/profiles/:scope/:profileId/agent", (context) =>
    context.json(chat.profileAgent(referenceOf(context), projectOf(context))),
  );
  routes.put("/profiles/:scope/:profileId", async (context) => {
    const reference = referenceOf(context);
    const projectId = projectOf(context);
    await store.putProfile(reference, projectId, await bodyOf(context), revisionOf(context));
    await chat.reconcile();
    return resource(context, store.profile(reference, projectId));
  });
  routes.put("/profiles/:scope/:profileId/settings", async (context) => {
    const change = readSettingsChange(await bodyOf(context));
    if (
      change === undefined ||
      !(await chat.changeSettings(
        referenceOf(context),
        projectOf(context),
        change,
        revisionOf(context),
      ))
    ) {
      throw new ConfigurationError(
        "This profile setting is invalid or unavailable.",
        "Profile",
        "/settings",
      );
    }
    return context.json(chat.profileAgent(referenceOf(context), projectOf(context)));
  });
  return routes;

  function projectOf(context: Context): string {
    return context.req.query("projectId") ?? store.projects()[0]?.id ?? "";
  }
}

/** Returns a precise configuration error without hiding unexpected failures. */
export function configurationErrorResponse(error: Error, context: Context): Response {
  if (error instanceof ConfigurationError) {
    return context.json({ error: error.message, issues: error.issues }, error.status);
  }
  throw error;
}

function referenceOf(context: Context): ProfileReference {
  const scope = context.req.param("scope");
  if (scope !== "user" && scope !== "project") {
    throw new ConfigurationError("Expected user or project.", "Profile", "/scope");
  }
  return { scope, id: context.req.param("profileId") ?? "" };
}

/** Reads a strict configuration request body. */
export async function bodyOf(context: Context): Promise<unknown> {
  return parseConfigurationJson(await context.req.text(), "Request body");
}

/** Returns the conditional revision supplied by a configuration editor. */
export function revisionOf(context: Context): string | undefined {
  return context.req.header("If-None-Match") === "*" ? "*" : context.req.header("If-Match");
}

function resource(context: Context, value: { revision: string }): Response {
  context.header("ETag", value.revision);
  return context.json(value);
}

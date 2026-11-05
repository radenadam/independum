import type {
  AgentSummary,
  ChatConfiguration,
  ConfigurationResource,
  ProfileBundle,
  ProfileReference,
  ProfileResource,
  ProjectSettingsDocument,
  UserSettingsDocument,
} from "independum/api-types";
import { requestApi } from "./request-api.ts";

/** Profiles and defaults available to the current project. */
export interface ProfileList {
  profiles: ProfileResource[];
  user: ConfigurationResource<UserSettingsDocument>;
  project: ConfigurationResource<ProjectSettingsDocument>;
  projects: { id: string; folder: string }[];
}

/** Returns the profiles and defaults for one known project. */
export async function fetchProfiles(projectId?: string): Promise<ProfileList> {
  return readResponse(
    await requestApi(
      `/api/profiles${projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
    ),
  );
}

/** Returns the same agent editors in an explicit profile context. */
export async function fetchProfileAgent(profile: ProfileResource): Promise<AgentSummary> {
  return readResponse(await requestApi(profilePath(profile, "/agent")));
}

/** Saves a profile bundle against the disk revision shown by its editor. */
export async function saveProfile(
  profile: ProfileResource,
  bundle: ProfileBundle | string,
  revision: string = profile.revision,
): Promise<ProfileResource> {
  return readResponse(
    await requestApi(profilePath(profile), {
      method: "PUT",
      revision,
      ...(typeof bundle === "string" ? { bodyText: bundle } : { body: bundle }),
    }),
  );
}

/** Saves a default without overwriting a more recent file edit. */
export async function saveProfileDefault(
  resource: ConfigurationResource<UserSettingsDocument | ProjectSettingsDocument>,
  reference: ProfileReference | null,
  projectId?: string,
): Promise<void> {
  const document = resource.document;
  if (document === null) {
    throw new Error("Repair this settings file before choosing a default.");
  }
  const body =
    "defaultProfile" in document
      ? { ...document, defaultProfile: reference }
      : { formatVersion: 1, ...(reference === null ? {} : { profile: reference }) };
  await readResponse(
    await requestApi(
      projectId === undefined
        ? "/api/settings"
        : `/api/projects/${encodeURIComponent(projectId)}/settings`,
      { method: "PUT", revision: resource.revision, body },
    ),
  );
}

/** Changes the selected profile and clears the chat's model and effort overrides. */
export async function switchProfile(
  chatId: string,
  configuration: ChatConfiguration,
  reference: ProfileReference,
): Promise<void> {
  await readResponse(
    await requestApi(`/api/chats/${encodeURIComponent(chatId)}/settings`, {
      method: "PUT",
      revision: configuration.choices.revision,
      body: { formatVersion: 1, profile: reference },
    }),
  );
}

/** Returns the explicit API address of a profile resource. */
export function profilePath(
  profile: Pick<ProfileResource, "reference" | "projectId">,
  suffix = "",
): string {
  return `/api/profiles/${profile.reference.scope}/${encodeURIComponent(profile.reference.id)}${suffix}?projectId=${encodeURIComponent(profile.projectId)}`;
}

/** Reads a configuration response and preserves its precise file diagnostic. */
export async function readResponse<Value>(response: Response): Promise<Value> {
  const value = (await response.json()) as Value & { error?: string };
  if (!response.ok) {
    throw new Error(value.error ?? "The configuration could not be saved.");
  }
  return value;
}

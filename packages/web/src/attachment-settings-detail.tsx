import type { AttachmentSettings } from "independum/api-types";
import type { ReactElement } from "react";
import { EditActions } from "./edit-actions.tsx";
import { NumberSetting } from "./number-setting.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

const limits: {
  key: keyof Omit<AttachmentSettings, "includeDetails" | "resizeImages">;
  label: string;
}[] = [
  { key: "maxCount", label: "Attachments per prompt" },
  { key: "maxFileBytes", label: "Original bytes per attachment" },
  { key: "maxTotalBytes", label: "Original bytes per prompt" },
  { key: "maxTextBytes", label: "Inline text bytes per attachment" },
  { key: "maxTotalTextBytes", label: "Inline text bytes per prompt" },
];

/** Draws attachment limits, preparation switches, and their editable model facts. */
export function AttachmentSettingsDetail({ settings }: { settings: AgentSettings }): ReactElement {
  const { agent } = settings;
  const current = agent?.attachments;
  const builtIn = agent?.builtInAttachments;
  if (current === undefined || builtIn === undefined) {
    return <PlaceNote>Loading attachment settings.</PlaceNote>;
  }
  const isEdited =
    settings.isEditedGroup("Attachments") ||
    Object.entries(current).some(
      ([key, value]) => value !== builtIn[key as keyof AttachmentSettings],
    );
  return (
    <PlaceSection
      heading="Attachments"
      badge="built-in"
      mark={settings.markOf("Attachments", isEdited)}
      actions={
        <EditActions
          editLabel="Edit attachment model texts"
          resetLabel="Reset attachments to built-in"
          isEdited={isEdited}
          onEdit={() => settings.setEditing("Attachments")}
          onReset={() =>
            settings.change({ attachments: builtIn, texts: settings.builtInTextsOf("Attachments") })
          }
        />
      }
    >
      <ToggleSwitch
        label="Include attachment details"
        isOn={current.includeDetails}
        onChange={(includeDetails) =>
          settings.change({ attachments: { ...current, includeDetails } })
        }
      />
      <ToggleSwitch
        label="Resize attached images"
        isOn={current.resizeImages}
        onChange={(resizeImages) => settings.change({ attachments: { ...current, resizeImages } })}
      />
      {limits.map(({ key, label }) => (
        <NumberSetting
          key={key}
          id={`attachment-${key}`}
          label={label}
          value={current[key]}
          builtIn={builtIn[key]}
          onChange={(value) =>
            settings.change({ attachments: { ...current, [key]: value ?? builtIn[key] } })
          }
        />
      ))}
      <PlaceNote>
        These limits apply to original bytes and decoded UTF-8 text. Aggregate limits must be at
        least their per-file limits. They do not guarantee that a prompt fits the model context
        window.
      </PlaceNote>
      <PlaceNote>
        PDF, Office documents, and other binary files include their saved file path. Their contents
        are not extracted. Turning attachment details off removes that path.
      </PlaceNote>
      <PlaceNote>
        Images use Pi preparation and the selected model limits. Context controls can also turn
        image resizing off. Preparation happens again at handoff with the applied profile.
      </PlaceNote>
    </PlaceSection>
  );
}

/** Opens the shared note envelope independently of tool and attachment texts. */
export function NotesDetail({ settings }: { settings: AgentSettings }): ReactElement {
  return (
    <PlaceSection
      heading="Notes"
      badge="built-in"
      mark={settings.markOf("Notes", false)}
      actions={
        <EditActions
          editLabel="Edit the note envelope"
          resetLabel="Reset the note envelope to built-in"
          isEdited={settings.isEditedGroup("Notes")}
          onEdit={() => settings.setEditing("Notes")}
          onReset={() => settings.change({ texts: settings.builtInTextsOf("Notes") })}
        />
      }
    >
      <PlaceNote>
        The envelope names the source of notes added by Independum. Attachments and background
        command notes share it.
      </PlaceNote>
    </PlaceSection>
  );
}

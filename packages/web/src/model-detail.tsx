import type { ModelOverrides, ModelPrices, ModelSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { type FactRow, FactTable } from "./fact-table.tsx";
import { KnowledgeCutoffField } from "./knowledge-cutoff-field.tsx";
import { NumberSetting } from "./number-setting.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { countOf, tokenRows } from "./usage-table.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Properties of the detail of a model. */
interface ModelDetailProps {
  model: ModelSummary | undefined;
  settings: AgentSettings;
}

const numberFormat = new Intl.NumberFormat();
const sizeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
// A price keeps the digits it has, such as 0.125, and at least two.
const priceFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
// The prices follow the rows of the use of a chat, so each price reads like what it is for.
// Thinking is output, so it has no price of its own.
const priceRows = tokenRows.filter(
  (row): row is { key: keyof ModelPrices; name: string } => row.key !== "reasoning",
);

/**
 * Draws what Pi knows of the model of a chat: where its requests go, its limits, its prices, and
 * how long its provider keeps the prompt cache.
 */
export function ModelDetail({ model, settings }: ModelDetailProps): ReactElement {
  if (model === undefined) {
    return <PlaceNote>No model chosen yet.</PlaceNote>;
  }
  const tiers = model.priceTiers.toSorted((first, second) => first.inputAbove - second.inputAbove);
  const selected = settings.agent?.modelSettings;
  const modelSettings =
    selected?.providerId === model.providerId && selected.modelId === model.id
      ? selected
      : undefined;
  function change(key: keyof ModelOverrides, value: number | null): void {
    if (modelSettings === undefined) {
      return;
    }
    settings.change({
      modelOverrides: { [modelSettings.providerId]: { [modelSettings.modelId]: { [key]: value } } },
    });
  }
  const [firstTier] = tiers;
  const cacheRows: FactRow[] = [
    ...(model.cacheSeconds.short === null
      ? []
      : [{ name: "Short lifetime", values: [durationOf(model.cacheSeconds.short)] }]),
    ...(model.cacheSeconds.long === null
      ? []
      : [{ name: "Long lifetime", values: [durationOf(model.cacheSeconds.long)] }]),
  ];
  return (
    <>
      <PlaceSection heading={model.name} badge="read-only">
        <PlaceNote>
          Pi knows these facts of the model, and sends each request to its address.
        </PlaceNote>
        <FactTable
          columns={[""]}
          rows={[
            { name: "Provider", values: [model.providerName] },
            { name: "API", values: [model.api] },
            { name: "Address", values: [model.baseUrl] },
          ]}
        />
      </PlaceSection>
      <PlaceSection
        heading="Settings"
        mark={
          modelSettings !== undefined && Object.keys(modelSettings.overrides).length > 0
            ? "edited"
            : undefined
        }
      >
        <PlaceNote>These settings apply to this model in chats using this profile.</PlaceNote>
        {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
        {modelSettings === undefined ? (
          <PlaceNote>Loading the model settings.</PlaceNote>
        ) : (
          <>
            <NumberSetting
              id="model-context-window"
              label="Context window in tokens"
              value={modelSettings.overrides.contextWindow ?? modelSettings.builtIn.contextWindow}
              builtIn={modelSettings.builtIn.contextWindow}
              onChange={(value) => change("contextWindow", value)}
            />
            <NumberSetting
              id="model-max-output"
              label="Maximum output tokens of a reply"
              value={modelSettings.overrides.maxOutput ?? modelSettings.builtIn.maxOutput}
              builtIn={modelSettings.builtIn.maxOutput}
              onChange={(value) => change("maxOutput", value)}
            />
            <NumberSetting
              id="model-temperature"
              label="Temperature"
              value={modelSettings.overrides.temperature ?? modelSettings.builtIn.temperature}
              builtIn={modelSettings.builtIn.temperature}
              minimum={0}
              isDecimal
              onChange={(value) => change("temperature", value)}
            />
            <PlaceNote>
              Pi passes temperature where the provider and thinking mode accept it. Pi does not list
              which models accept it or their ranges. With none set, the provider chooses its
              default.
            </PlaceNote>
            <PlaceNote>
              Pi may lower the output limit to fit the remaining context window.
            </PlaceNote>
          </>
        )}
      </PlaceSection>
      <KnowledgeCutoffField
        key={`${model.providerId}:${model.id}`}
        model={model}
        settings={settings}
      />
      <PlaceSection heading="Limits">
        <FactTable columns={[""]} rows={limitRowsOf(model)} />
      </PlaceSection>
      <PlaceSection heading="Prices">
        <PlaceNote>
          In US dollars for a million tokens.
          {firstTier === undefined
            ? null
            : ` A request with more than ${numberFormat.format(firstTier.inputAbove)} input tokens, counting the cache, costs the higher prices for all of its tokens.`}
        </PlaceNote>
        <FactTable
          columns={
            firstTier === undefined
              ? [""]
              : [
                  `Up to ${numberFormat.format(firstTier.inputAbove)}`,
                  ...tiers.map((tier) => `Above ${numberFormat.format(tier.inputAbove)}`),
                ]
          }
          rows={priceRows.map((row) => ({
            name: row.name,
            values: [model.prices, ...tiers.map((tier) => tier.prices)].map((prices) =>
              priceFormat.format(prices[row.key]),
            ),
          }))}
        />
      </PlaceSection>
      <PlaceSection heading="Prompt cache">
        {cacheRows.length === 0 ? (
          <PlaceNote>Pi does not know how long the provider keeps the prompt cache.</PlaceNote>
        ) : (
          <>
            <PlaceNote>
              How long the provider keeps the start of a request that it has seen.
            </PlaceNote>
            <FactTable columns={[""]} rows={cacheRows} />
          </>
        )}
      </PlaceSection>
    </>
  );
}

function limitRowsOf(model: ModelSummary): FactRow[] {
  const { images } = model;
  const resized = images?.resizedTo ?? null;
  const fit = [
    resized?.width == null || resized.height == null
      ? null
      : `${numberFormat.format(resized.width)} by ${numberFormat.format(resized.height)} pixels`,
    resized?.bytes == null ? null : sizeOf(resized.bytes),
  ].filter((part) => part !== null);
  return [
    {
      name: "Images",
      values: [
        images === null
          ? "Not taken"
          : images.perRequest === null
            ? "Taken"
            : `Up to ${numberFormat.format(images.perRequest)} in a request`,
      ],
    },
    ...(images?.perMessage == null
      ? []
      : [
          {
            name: "Images in a message",
            values: [`Up to ${numberFormat.format(images.perMessage)}`],
          },
        ]),
    ...(fit.length === 0
      ? []
      : [{ name: "Larger images", values: [`Resized to fit ${fit.join(" and ")}`] }]),
    ...(model.requestBytes === null
      ? []
      : [{ name: "Request size", values: [`Up to ${sizeOf(model.requestBytes)}`] }]),
  ];
}

function sizeOf(bytes: number): string {
  return `${sizeFormat.format(bytes / 1024 / 1024)} MB`;
}

function durationOf(seconds: number): string {
  if (seconds % 3600 === 0) {
    return countOf(seconds / 3600, "hour", "hours");
  }
  return seconds % 60 === 0
    ? countOf(seconds / 60, "minute", "minutes")
    : countOf(seconds, "second", "seconds");
}

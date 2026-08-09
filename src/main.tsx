import React from "react";
import ReactDOM from "react-dom/client";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import App, {
  getBrochureClientId,
  type BrochurePersistence,
  type SavedBrochure,
} from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexEnabled =
  Boolean(convexUrl) && import.meta.env.VITE_DISABLE_CONVEX !== "true";
function ConnectedApp() {
  const [clientId] = React.useState(getBrochureClientId);
  const createBrochure = useMutation(api.brochures.create);
  const completeBrochure = useMutation(api.brochures.complete);
  const failBrochure = useMutation(api.brochures.fail);
  const generateUploadUrl = useMutation(api.brochures.generateUploadUrl);
  const listedBrochures = useQuery(api.brochures.listByClient, { clientId });
  const requestedGenerationId = new URLSearchParams(window.location.search).get(
    "brochure",
  );
  const requestedBrochure = useQuery(
    api.brochures.getByGenerationId,
    requestedGenerationId
      ? { generationId: requestedGenerationId }
      : "skip",
  );

  const brochures = React.useMemo<SavedBrochure[] | undefined>(() => {
    if (listedBrochures === undefined && requestedBrochure === undefined) {
      return undefined;
    }
    const unique = new Map<string, SavedBrochure>();
    for (const brochure of [
      ...(listedBrochures ?? []),
      ...(requestedBrochure ? [requestedBrochure] : []),
    ]) {
      if (brochure.imageUrl) {
        unique.set(brochure.generationId, brochure as SavedBrochure);
      }
    }
    return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [listedBrochures, requestedBrochure]);

  const persistence = React.useMemo<BrochurePersistence>(
    () => ({
      create: async (input) => {
        await createBrochure(input);
      },
      complete: async ({
        clientId: ownerClientId,
        generationId,
        imageDataUrl,
        mediaType,
        warnings,
      }) => {
        const image = await fetch(imageDataUrl).then((response) => response.blob());
        const uploadUrl = await generateUploadUrl({});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "content-type": mediaType },
          body: image,
        });
        if (!uploadResponse.ok) {
          throw new Error(`Image upload failed (${uploadResponse.status}).`);
        }
        const { storageId } = (await uploadResponse.json()) as {
          storageId: Id<"_storage">;
        };
        return await completeBrochure({
          clientId: ownerClientId,
          generationId,
          imageStorageId: storageId,
          mediaType,
          warnings,
        });
      },
      fail: async (input) => {
        await failBrochure(input);
      },
    }),
    [completeBrochure, createBrochure, failBrochure, generateUploadUrl],
  );

  return (
    <App
      brochureClientId={clientId}
      brochurePersistence={persistence}
      convexEnabled
      savedBrochures={brochures}
    />
  );
}

const app = convexEnabled ? (
  <ConnectedApp />
) : (
  <App brochureClientId={getBrochureClientId()} convexEnabled={false} />
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convexEnabled && convexUrl ? (
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        {app}
      </ConvexProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);

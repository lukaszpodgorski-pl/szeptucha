import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard from "./ModelCard";
import WordmarkLogo from "../icons/WordmarkLogo";
import { useModelStore } from "../../stores/modelStore";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();

  // Guards so the auto-download and the completion handoff each run once.
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  // Automatically download every bundled model that isn't present yet.
  // The user doesn't pick a model — all of them are fetched up front.
  useEffect(() => {
    if (startedRef.current) return;
    if (models.length === 0) return;

    startedRef.current = true;
    models
      .filter((m) => !m.is_downloaded)
      .forEach((m) => {
        // Progress is tracked centrally in the model store.
        void downloadModel(m.id);
      });
  }, [models, downloadModel]);

  // Once everything is downloaded (and nothing is in flight), select the
  // recommended model and continue into the app.
  useEffect(() => {
    if (completedRef.current) return;
    if (!startedRef.current) return;
    if (models.length === 0) return;

    // `is_downloaded` is the backend's definitive "fully installed" signal
    // (file present, and for directory models: verified + extracted). Relying on
    // it alone avoids getting stuck if an in-flight map is left populated by a
    // missed/raced event (e.g. a dev hot-reload mid-download).
    const allDownloaded = models.every((m) => m.is_downloaded);

    if (allDownloaded) {
      completedRef.current = true;
      const target = models.find((m) => m.is_recommended) ?? models[0];
      selectModel(target.id).then((success) => {
        if (success) {
          onModelSelected();
        } else {
          toast.error(t("onboarding.errors.selectModel"));
          completedRef.current = false;
        }
      });
    }
  }, [
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    onModelSelected,
    t,
  ]);

  // Allow retrying a model whose download failed by clicking its card.
  const handleRetry = (modelId: string) => {
    void downloadModel(modelId);
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    return "downloadable";
  };

  const getModelDownloadProgress = (modelId: string): number | undefined =>
    downloadProgress[modelId]?.percentage;

  const getModelDownloadSpeed = (modelId: string): number | undefined =>
    downloadStats[modelId]?.speed;

  return (
    <div className="h-screen w-screen flex flex-col p-6 gap-4 inset-0">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <WordmarkLogo width={200} />
        <p className="text-text/70 max-w-md font-medium mx-auto">
          {t("onboarding.subtitle")}
        </p>
      </div>

      <div className="max-w-[600px] w-full mx-auto text-center flex-1 flex flex-col min-h-0">
        <div className="flex flex-col gap-4 pb-6">
          {models.map((model: ModelInfo) => (
            <ModelCard
              key={model.id}
              model={model}
              variant={model.is_recommended ? "featured" : "default"}
              status={getModelStatus(model.id)}
              onSelect={handleRetry}
              onDownload={handleRetry}
              downloadProgress={getModelDownloadProgress(model.id)}
              downloadSpeed={getModelDownloadSpeed(model.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;

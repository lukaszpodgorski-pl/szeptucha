import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard from "./ModelCard";
import WordmarkLogo from "../icons/WordmarkLogo";
import { Button } from "../ui/Button";
import { useModelStore } from "../../stores/modelStore";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t } = useTranslation();
  const {
    models,
    currentModel,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();

  // Disable "Continue" while we hand off to the app so it can't fire twice.
  const [continuing, setContinuing] = useState(false);

  // The user picks which models to download instead of fetching all up front.
  // Clicking a not-yet-downloaded card starts (or retries) its download.
  const handleDownload = (modelId: string) => {
    void downloadModel(modelId);
  };

  // Clicking an already-downloaded card makes it the active model.
  const handleSelect = (modelId: string) => {
    void selectModel(modelId);
  };

  // At least one fully-installed model is required before entering the app.
  const hasDownloadedModel = models.some((m) => m.is_downloaded);

  // Finish onboarding: ensure a downloaded model is selected, then hand off.
  // Falls back to the recommended (or first) downloaded model if the user
  // never explicitly clicked one.
  const handleContinue = async () => {
    if (continuing) return;

    const selected = models.find(
      (m) => m.id === currentModel && m.is_downloaded,
    );
    const target =
      selected ??
      models.find((m) => m.is_downloaded && m.is_recommended) ??
      models.find((m) => m.is_downloaded);

    if (!target) return;

    setContinuing(true);
    const success = await selectModel(target.id);
    if (success) {
      onModelSelected();
    } else {
      toast.error(t("onboarding.errors.selectModel"));
      setContinuing(false);
    }
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    if (modelId === currentModel) return "active";
    const model = models.find((m) => m.id === modelId);
    if (model?.is_downloaded) return "available";
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

      <div className="max-w-[600px] w-full mx-auto text-center flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-4 pb-6">
          {models.map((model: ModelInfo) => (
            <ModelCard
              key={model.id}
              model={model}
              variant={model.is_recommended ? "featured" : "default"}
              status={getModelStatus(model.id)}
              onSelect={handleSelect}
              onDownload={handleDownload}
              downloadProgress={getModelDownloadProgress(model.id)}
              downloadSpeed={getModelDownloadSpeed(model.id)}
            />
          ))}
        </div>
      </div>

      <div className="max-w-[600px] w-full mx-auto flex flex-col items-center gap-2 shrink-0">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!hasDownloadedModel || continuing}
          onClick={handleContinue}
        >
          {t("onboarding.continue")}
        </Button>
        <p className="text-text/60 text-sm">{t("onboarding.selectHint")}</p>
      </div>
    </div>
  );
};

export default Onboarding;

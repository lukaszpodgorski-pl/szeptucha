import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface EditBeforePasteProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const EditBeforePaste: React.FC<EditBeforePasteProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const editBeforePaste = getSetting("edit_before_paste") ?? false;

    return (
      <ToggleSwitch
        checked={editBeforePaste}
        onChange={(enabled) => updateSetting("edit_before_paste", enabled)}
        isUpdating={isUpdating("edit_before_paste")}
        label={t("settings.editBeforePaste.label")}
        description={t("settings.editBeforePaste.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        tooltipPosition="bottom"
      />
    );
  },
);

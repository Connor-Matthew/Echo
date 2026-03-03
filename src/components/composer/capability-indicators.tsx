import { Brain, ImageIcon, Mic, Video } from "lucide-react";
import type { ModelCapabilities } from "../../shared/contracts";

type CapabilityIndicatorsProps = {
  modelCapabilities: ModelCapabilities;
  usageLabel?: string | null;
};

export const CapabilityIndicators = ({
  modelCapabilities,
  usageLabel
}: CapabilityIndicatorsProps) => (
  <>
    <div className="flex shrink-0 items-center gap-0.5">
      {[
        {
          key: "reasoningDisplay",
          label: "深度思考",
          Icon: Brain,
          enabled: modelCapabilities.reasoningDisplay
        },
        {
          key: "imageInput",
          label: "图片输入",
          Icon: ImageIcon,
          enabled: modelCapabilities.imageInput
        },
        {
          key: "audioInput",
          label: "音频输入",
          Icon: Mic,
          enabled: modelCapabilities.audioInput
        },
        {
          key: "videoInput",
          label: "视频输入",
          Icon: Video,
          enabled: modelCapabilities.videoInput
        }
      ]
        .filter(({ key, enabled }) =>
          key === "audioInput" || key === "videoInput" ? enabled : true
        )
        .map(({ key, label, Icon, enabled }) => (
          <span
            key={key}
            title={`${label}${enabled ? "" : "（当前模型不支持）"}`}
            aria-label={label}
            className={[
              "inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center",
              enabled ? "rounded-full bg-accent/65 text-foreground" : "text-muted-foreground/65"
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
    </div>
    {usageLabel ? (
      <p className="ml-1 max-w-[220px] shrink-0 text-xs font-medium tabular-nums leading-none text-muted-foreground">
        {usageLabel}
      </p>
    ) : null}
  </>
);

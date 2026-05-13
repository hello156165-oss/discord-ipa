import * as React from "react";

import { ALL_BADGES } from "./badges";
import { getApi } from "./runtime";
import type { LarpStorage } from "./storage";

interface Props {
  storage: LarpStorage;
  diagVersion?: string;
}

// ---------------------------------------------------------------------------
// Component resolution helpers
// ---------------------------------------------------------------------------
// Discord renames / moves components between versions, so we defensively
// look each one up at render time and fall back to a react-native primitive
// when something is missing. This avoids the "Element type is invalid:
// expected a string or class but got undefined" runtime explosion that we
// suspect was making `Configure` open a blank/broken page.

function pickComponents() {
  const api = getApi();
  const RN = (api.metro.common.ReactNative ?? {}) as any;
  const c = (api.metro.common.components ?? {}) as any;

  // Inline factory for a tiny "row" used when TableSwitchRow / TableRow
  // happen to be missing from the resolved components.
  const FallbackText = (RN.Text ?? "Text") as React.ComponentType<any> | string;
  const FallbackView = (RN.View ?? "View") as React.ComponentType<any> | string;

  function FallbackGroup({
    title,
    children,
  }: {
    title?: string;
    children: React.ReactNode;
  }) {
    return React.createElement(
      FallbackView,
      {
        style: {
          marginVertical: 8,
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.04)",
        },
      },
      title
        ? React.createElement(
            FallbackText,
            { style: { padding: 12, fontWeight: "600" } },
            title
          )
        : null,
      children
    );
  }

  function FallbackSwitchRow(props: any) {
    return React.createElement(
      FallbackView,
      {
        style: {
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      React.createElement(
        FallbackText,
        { style: { color: "#dbdee1", flex: 1 } },
        props.label ?? ""
      ),
      RN.Switch
        ? React.createElement(RN.Switch, {
            value: !!props.value,
            onValueChange: props.onValueChange,
          })
        : null
    );
  }

  function FallbackTextInput(props: any) {
    if (!RN.TextInput) return null;
    return React.createElement(
      FallbackView,
      { style: { padding: 12 } },
      props.label
        ? React.createElement(
            FallbackText,
            {
              style: {
                color: "#b5bac1",
                fontSize: 12,
                marginBottom: 4,
              },
            },
            props.label
          )
        : null,
      React.createElement(RN.TextInput, {
        value: props.value ?? "",
        placeholder: props.placeholder,
        placeholderTextColor: "#80848e",
        onChangeText: (v: string) => {
          (props.onChange ?? props.onChangeText)?.(v);
        },
        style: {
          color: "#ffffff",
          padding: 10,
          borderRadius: 8,
          backgroundColor: "rgba(0,0,0,0.3)",
        },
        maxLength: props.maxLength,
      })
    );
  }

  function FallbackButton(props: any) {
    if (!RN.TouchableOpacity)
      return React.createElement(FallbackText, null, props.text ?? "");
    return React.createElement(
      RN.TouchableOpacity,
      {
        onPress: props.onPress,
        style: {
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.06)",
          alignSelf: "flex-start",
          marginTop: 8,
          marginLeft: 12,
        },
      },
      React.createElement(
        FallbackText,
        { style: { color: "#dbdee1" } },
        props.text ?? ""
      )
    );
  }

  return {
    ScrollView: (RN.ScrollView ?? FallbackView) as React.ComponentType<any>,
    View: (RN.View ?? FallbackView) as React.ComponentType<any>,
    Text: (c.Text ?? FallbackText) as React.ComponentType<any> | string,
    TableRowGroup: (c.TableRowGroup ?? FallbackGroup) as React.ComponentType<any>,
    TableSwitchRow: (c.TableSwitchRow ??
      FallbackSwitchRow) as React.ComponentType<any>,
    TableRow: c.TableRow ?? null,
    TextInput: (c.TextInput ?? FallbackTextInput) as React.ComponentType<any>,
    Button: (c.Button ?? FallbackButton) as React.ComponentType<any>,
  };
}

// ---------------------------------------------------------------------------
// Local state hook -- mirrors the persistent storage and writes back through.
// We do NOT poll the proxy; instead each setter both updates local React
// state (for re-render) and assigns back into `storage` (for persistence).
// ---------------------------------------------------------------------------
function useLarpState(storage: LarpStorage) {
  const [state, setState] = React.useState<LarpStorage>(() => ({
    enabled: storage.enabled ?? true,
    username: storage.username ?? "",
    globalName: storage.globalName ?? "",
    discriminator: storage.discriminator ?? "",
    badges: { ...(storage.badges ?? {}) },
    creationDate: storage.creationDate ?? "",
  }));

  function patch<K extends keyof LarpStorage>(key: K, value: LarpStorage[K]) {
    setState((s) => ({ ...s, [key]: value }));
    try {
      // @ts-expect-error -- index-by-key write
      storage[key] = value;
    } catch (err) {
      console.error("[Larp] failed to persist", key, err);
    }
  }

  return { state, patch };
}

function safeDateInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function LarpSettingsInner({ storage, diagVersion }: Props): JSX.Element {
  const C = pickComponents();
  const { state, patch } = useLarpState(storage);

  return React.createElement(
    C.ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 64 } },
    React.createElement(
      C.View,
      { style: { padding: 12, gap: 16 } },
      // Banner so we know rendering works even if every section below fails.
      React.createElement(
        C.View,
        {
          style: {
            padding: 12,
            borderRadius: 12,
            backgroundColor: "rgba(88,101,242,0.15)",
          },
        },
        React.createElement(
          C.Text,
          { style: { color: "#dbdee1" } },
          `Larp loaded${diagVersion ? ` (${diagVersion})` : ""} — overrides below are local only.`
        )
      ),

      // -----------------------------------------------------------------
      // Master toggle
      // -----------------------------------------------------------------
      React.createElement(
        C.TableRowGroup,
        { title: "Larp" },
        React.createElement(C.TableSwitchRow, {
          label: "Enable Larp",
          subLabel: "Toggle every override at once.",
          value: state.enabled,
          onValueChange: (v: boolean) => patch("enabled", v),
        })
      ),

      // -----------------------------------------------------------------
      // Identity
      // -----------------------------------------------------------------
      React.createElement(
        C.TableRowGroup,
        { title: "Identity (local only)" },
        React.createElement(C.TextInput, {
          label: "Username",
          placeholder: "empty = keep real username",
          value: state.username,
          onChange: (v: string) => patch("username", v),
          onChangeText: (v: string) => patch("username", v),
          size: "md",
        }),
        React.createElement(C.TextInput, {
          label: "Display name",
          placeholder: "empty = keep real display name",
          value: state.globalName,
          onChange: (v: string) => patch("globalName", v),
          onChangeText: (v: string) => patch("globalName", v),
          size: "md",
        }),
        React.createElement(C.TextInput, {
          label: "Discriminator (4 digits, legacy #1234)",
          placeholder: "empty or 4 digits",
          value: state.discriminator,
          onChange: (v: string) =>
            patch("discriminator", v.replace(/[^0-9]/g, "").slice(0, 4)),
          onChangeText: (v: string) =>
            patch("discriminator", v.replace(/[^0-9]/g, "").slice(0, 4)),
          maxLength: 4,
          size: "md",
        }),
        React.createElement(C.Button, {
          text: "Reset identity",
          variant: "secondary",
          size: "sm",
          onPress: () => {
            patch("username", "");
            patch("globalName", "");
            patch("discriminator", "");
          },
        })
      ),

      // -----------------------------------------------------------------
      // Badges
      // -----------------------------------------------------------------
      React.createElement(
        C.TableRowGroup,
        { title: "Badges (local only)" },
        ...ALL_BADGES.map((b) =>
          React.createElement(C.TableSwitchRow, {
            key: b.id,
            label: b.label,
            value: !!state.badges[b.id],
            onValueChange: (v: boolean) =>
              patch("badges", { ...state.badges, [b.id]: v }),
          })
        ),
        React.createElement(C.Button, {
          text: "Reset badges",
          variant: "secondary",
          size: "sm",
          onPress: () => patch("badges", {}),
        })
      ),

      // -----------------------------------------------------------------
      // Account creation date
      // -----------------------------------------------------------------
      React.createElement(
        C.TableRowGroup,
        { title: "Account creation date (local only)" },
        React.createElement(C.TextInput, {
          label: "Date (YYYY-MM-DD)",
          placeholder: "e.g. 2015-05-13",
          value: safeDateInputValue(state.creationDate),
          onChange: (v: string) => {
            if (!v) return patch("creationDate", "");
            const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return;
            const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
            if (!Number.isNaN(new Date(iso).getTime())) {
              patch("creationDate", iso);
            }
          },
          onChangeText: (v: string) => {
            if (!v) return patch("creationDate", "");
            const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return;
            const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
            if (!Number.isNaN(new Date(iso).getTime())) {
              patch("creationDate", iso);
            }
          },
          size: "md",
        }),
        React.createElement(C.Button, {
          text: "Reset date",
          variant: "secondary",
          size: "sm",
          onPress: () => patch("creationDate", ""),
        })
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Error boundary so a render failure shows a readable message instead of a
// blank screen.
// ---------------------------------------------------------------------------
type EBState = { error: Error | null };
class LarpErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  EBState
> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Larp] settings render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const RN = (getApi().metro.common.ReactNative ?? {}) as any;
    const View = RN.View ?? ("View" as any);
    const Text = RN.Text ?? ("Text" as any);
    return React.createElement(
      View,
      { style: { padding: 16, gap: 8 } },
      React.createElement(
        Text,
        { style: { color: "#f23f43", fontWeight: "700" } },
        "Larp settings crashed"
      ),
      React.createElement(
        Text,
        { style: { color: "#dbdee1", fontFamily: "monospace" } },
        String(this.state.error?.message ?? this.state.error)
      ),
      React.createElement(
        Text,
        { style: { color: "#80848e", fontSize: 11 } },
        String(this.state.error?.stack ?? "").slice(0, 800)
      )
    );
  }
}

export default function LarpSettings(props: Props): JSX.Element {
  return React.createElement(
    LarpErrorBoundary,
    null,
    React.createElement(LarpSettingsInner, props)
  );
}

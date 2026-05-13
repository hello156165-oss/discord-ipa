import * as React from "react";

import { ALL_BADGES } from "./badges";
import type { LarpStorage } from "./storage";

/**
 * Larp settings page. Rendered both inside the dedicated "Larp" tab we
 * register in the main Discord settings, and as the per-plugin settings
 * sheet accessible from the plugin list.
 *
 * All UI is built with Discord's own component library to keep the visual
 * style consistent. Components are pulled lazily through Kettu's metro
 * resolver so this file stays compatible across Discord versions.
 */

interface Props {
  storage: LarpStorage;
}

// Resolve Discord components once per render. Components are lazy proxies, so
// these reads are cheap.
function useDiscordComponents() {
  const c = bunny.metro.common.components;
  return {
    ScrollView: bunny.metro.common.ReactNative.ScrollView,
    View: bunny.metro.common.ReactNative.View,
    Stack: c.Stack,
    Text: c.Text,
    TextInput: c.TextInput,
    TableRow: c.TableRow,
    TableRowGroup: c.TableRowGroup,
    TableSwitchRow: c.TableSwitchRow,
    Button: c.Button,
  };
}

/**
 * Drive a re-render whenever the (proxied) storage object mutates.
 * Kettu's storage proxy uses @gullerya/object-observer underneath; the
 * cheapest reliable signal we have here is to bump a state value on every
 * change.
 */
function useStorageProxy(storage: LarpStorage) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    // Lightweight polling fallback in case Observable is not exposed.
    // Storage writes happen on user input so a low poll rate is fine and we
    // detach as soon as the component unmounts.
    let last = JSON.stringify(storage);
    const id = setInterval(() => {
      const cur = JSON.stringify(storage);
      if (cur !== last) {
        last = cur;
        force();
      }
    }, 500);
    return () => clearInterval(id);
  }, [storage]);
  return storage;
}

function safeDateInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DD for the manual date input below.
  return d.toISOString().slice(0, 10);
}

export default function LarpSettings({ storage }: Props): JSX.Element {
  const s = useStorageProxy(storage);
  const C = useDiscordComponents();

  const onResetIdentity = () => {
    s.username = "";
    s.globalName = "";
    s.discriminator = "";
  };

  const onResetBadges = () => {
    s.badges = {};
  };

  const onResetDate = () => {
    s.creationDate = "";
  };

  return (
    <C.ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 38 }}
    >
      <C.Stack
        style={{ paddingVertical: 24, paddingHorizontal: 12 }}
        spacing={24}
      >
        {/* ----------------------------------------------------------- */}
        {/* Master switch                                               */}
        {/* ----------------------------------------------------------- */}
        <C.TableRowGroup title="Larp">
          <C.TableSwitchRow
            label="Enable Larp"
            subLabel="Toggle every override at once. Settings below are kept."
            value={s.enabled}
            onValueChange={(v: boolean) => {
              s.enabled = v;
            }}
          />
        </C.TableRowGroup>

        {/* ----------------------------------------------------------- */}
        {/* Identity                                                    */}
        {/* ----------------------------------------------------------- */}
        <C.TableRowGroup title="Identity (local only)">
          <C.View style={{ padding: 16, gap: 12 }}>
            <C.TextInput
              label="Username"
              placeholder="leave empty to keep your real username"
              value={s.username}
              onChange={(v: string) => {
                s.username = v;
              }}
              size="md"
            />
            <C.TextInput
              label="Display name"
              placeholder="leave empty to keep your real display name"
              value={s.globalName}
              onChange={(v: string) => {
                s.globalName = v;
              }}
              size="md"
            />
            <C.TextInput
              label="Discriminator (legacy #1234)"
              placeholder="four digits, or empty"
              value={s.discriminator}
              onChange={(v: string) => {
                s.discriminator = v.replace(/[^0-9]/g, "").slice(0, 4);
              }}
              size="md"
              maxLength={4}
            />
            <C.Button
              text="Reset identity"
              variant="secondary"
              size="sm"
              onPress={onResetIdentity}
            />
          </C.View>
        </C.TableRowGroup>

        {/* ----------------------------------------------------------- */}
        {/* Badges                                                      */}
        {/* ----------------------------------------------------------- */}
        <C.TableRowGroup title="Badges (local only)">
          {ALL_BADGES.map((b) => (
            <C.TableSwitchRow
              key={b.id}
              label={b.label}
              icon={
                <C.TableRow.Icon
                  source={
                    bunny.api.assets.findAssetId(b.assetName) ?? {
                      uri: b.cdnUrl,
                    }
                  }
                />
              }
              value={Boolean(s.badges[b.id])}
              onValueChange={(v: boolean) => {
                // Reassign the whole map so the storage proxy notices a change
                // even on the nested key.
                s.badges = { ...s.badges, [b.id]: v };
              }}
            />
          ))}
          <C.View style={{ padding: 16 }}>
            <C.Button
              text="Reset badges"
              variant="secondary"
              size="sm"
              onPress={onResetBadges}
            />
          </C.View>
        </C.TableRowGroup>

        {/* ----------------------------------------------------------- */}
        {/* Account creation date                                       */}
        {/* ----------------------------------------------------------- */}
        <C.TableRowGroup title="Account creation date (local only)">
          <C.View style={{ padding: 16, gap: 12 }}>
            <C.TextInput
              label="Date (YYYY-MM-DD)"
              placeholder="e.g. 2015-05-13"
              value={safeDateInputValue(s.creationDate)}
              onChange={(v: string) => {
                // Build a stable midnight-UTC ISO string so the override
                // does not jitter between locales.
                if (!v) {
                  s.creationDate = "";
                  return;
                }
                const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) return;
                const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
                if (!Number.isNaN(new Date(iso).getTime())) {
                  s.creationDate = iso;
                }
              }}
              size="md"
            />
            <C.Text variant="text-xs/normal" color="text-muted">
              Tip: some places in Discord derive the date from your user ID
              and may bypass this override. Restart Discord after changing it.
            </C.Text>
            <C.Button
              text="Reset date"
              variant="secondary"
              size="sm"
              onPress={onResetDate}
            />
          </C.View>
        </C.TableRowGroup>
      </C.Stack>
    </C.ScrollView>
  );
}

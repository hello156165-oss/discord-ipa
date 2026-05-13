/* Larp — local Discord cosmetic plugin.
 *
 * Runs in Kettu's eval context. Kettu wraps this entire file as the body
 * of `vendetta => { return <THIS> }`, so we MUST evaluate to a single
 * expression: an IIFE that returns the plugin object.
 *
 * NO ES module imports. NO JSX. NO esbuild __toESM helpers. We grab
 * everything off the `vendetta` parameter directly — that's the most
 * reliable surface Kettu exposes.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Resolve runtime APIs from `vendetta` (the arrow parameter Kettu
  // guarantees is populated before our code runs).
  // ---------------------------------------------------------------------
  var React = vendetta.metro.common.React;
  var RN = vendetta.metro.common.ReactNative;
  var View = RN.View;
  var Text = RN.Text;
  var TextInput = RN.TextInput;
  var ScrollView = RN.ScrollView;
  var Pressable = RN.Pressable || RN.TouchableOpacity;

  var findByStoreName = vendetta.metro.findByStoreName;
  var findByName = vendetta.metro.findByName;
  var findByProps = vendetta.metro.findByProps;
  var after = vendetta.patcher.after;
  var showToast = vendetta.ui.toasts.showToast;
  var getAssetIDByName = vendetta.ui.assets.getAssetIDByName;

  // Persistent storage scoped to this plugin (MMKV under the hood).
  var storage = vendetta.plugin.storage;
  if (storage.matchUsername == null) storage.matchUsername = "";
  if (storage.replaceUsername == null) storage.replaceUsername = "";
  if (typeof storage.badges !== "object" || storage.badges === null) {
    storage.badges = {};
  }

  // ---------------------------------------------------------------------
  // All official Discord badges. id is internal, label is the human name,
  // assetName is the Discord asset registered in the app, cdnUrl is a
  // fallback if the local asset can't be found.
  // ---------------------------------------------------------------------
  var CDN = "https://cdn.discordapp.com/badge-icons";
  var BADGES = [
    { id: "staff",                   label: "Discord Staff",            asset: "StaffBadge",                       url: CDN + "/5e74e9b61934fc1f67c65515d1f7e60d.png" },
    { id: "partner",                 label: "Discord Partner",          asset: "DiscordPartnerBadge",              url: CDN + "/3f9748e53446a137a052f3454e2de41e.png" },
    { id: "moderator",               label: "Certified Moderator",      asset: "DiscordCertifiedModeratorBadge",   url: CDN + "/fee1624003e2fee35cb398e125dc479b.png" },
    { id: "hypesquad_events",        label: "HypeSquad Events",         asset: "HypeSquadEventsBadge",             url: CDN + "/bf01d1073931f921909045f3a39fd264.png" },
    { id: "hypesquad_bravery",       label: "HypeSquad Bravery",        asset: "HypeSquadBraveryBadge",            url: CDN + "/8a88d63823d8a71cd5e390baa45efa02.png" },
    { id: "hypesquad_brilliance",    label: "HypeSquad Brilliance",     asset: "HypeSquadBrillianceBadge",         url: CDN + "/011940fd013da3f7fb926e4a1cd2e618.png" },
    { id: "hypesquad_balance",       label: "HypeSquad Balance",        asset: "HypeSquadBalanceBadge",            url: CDN + "/3aa41de486fa12454c3761e8e223442e.png" },
    { id: "bug_hunter_1",            label: "Bug Hunter Level 1",       asset: "BugHunterLevel1Badge",             url: CDN + "/2717692c7dca7289b35297368a940dd0.png" },
    { id: "bug_hunter_2",            label: "Bug Hunter Level 2",       asset: "BugHunterLevel2Badge",             url: CDN + "/848f79194d4be5ff5f81505cbd0ce1e6.png" },
    { id: "active_developer",        label: "Active Developer",         asset: "ActiveDeveloperBadge",             url: CDN + "/6bdc42827a38498929a4920da12695d9.png" },
    { id: "verified_developer",      label: "Early Verified Bot Dev",   asset: "VerifiedDeveloperBadge",           url: CDN + "/6df5892e0f35b051f8b61eace34f4967.png" },
    { id: "early_supporter",         label: "Early Supporter",          asset: "EarlySupporterBadge",              url: CDN + "/7060786766c9c840eb3019e725d2b358.png" },
    { id: "premium",                 label: "Discord Nitro",            asset: "NitroSubscriberBadge",             url: CDN + "/2ba85e8026a8614b640c2837bcdfe21b.png" },
    { id: "premium_tenure_3_month",  label: "Nitro · 3 months",         asset: "NitroBronzeBadge",                 url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "premium_tenure_6_month",  label: "Nitro · 6 months",         asset: "NitroSilverBadge",                 url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "premium_tenure_12_month", label: "Nitro · 1 year",           asset: "NitroGoldBadge",                   url: CDN + "/d92998916f4ce6f74de7da0a37b8d740.png" },
    { id: "premium_tenure_24_month", label: "Nitro · 2 years",          asset: "NitroPlatinumBadge",               url: CDN + "/9d4f73ca6df09bc63a39ea84d5fd0ff5.png" },
    { id: "premium_tenure_36_month", label: "Nitro · 3 years",          asset: "NitroDiamondBadge",                url: CDN + "/65d6d6df9d56b8c3f4b3b1f3e4f3a0c8.png" },
    { id: "bot_commands",            label: "Supports Commands",        asset: "BotCommandsBadge",                 url: CDN + "/6f9e37f9029ff57aef81db857890005e.png" },
    { id: "automod",                 label: "Uses AutoMod",             asset: "AutoModBadge",                     url: CDN + "/f2459b691ac7453ed6039bbcfaccbfcd.png" },
    { id: "legacy_username",         label: "Originally Known As",      asset: "LegacyUsernameBadge",              url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "quest",                   label: "Completed a Quest",        asset: "QuestBadge",                       url: CDN + "/7d9ae358c8c5e118768335dbe68b4fb8.png" }
  ];

  function makeBadgePayload(b) {
    var assetId = null;
    try { assetId = getAssetIDByName(b.asset); } catch (_) {}
    return {
      id: "larp-" + b.id,
      description: b.label,
      icon: b.asset,
      source: assetId != null ? assetId : { uri: b.url }
    };
  }

  // ---------------------------------------------------------------------
  // Patches (applied in onLoad, released in onUnload).
  // ---------------------------------------------------------------------
  var unpatches = [];

  function patchUsername() {
    try {
      var UserStore = findByStoreName("UserStore");
      if (!UserStore || typeof UserStore.getCurrentUser !== "function") return;

      function wrap(user) {
        if (!user) return user;
        var match = storage.matchUsername;
        var replace = storage.replaceUsername;
        if (!match || !replace) return user;
        if (user.username !== match) return user;
        return new Proxy(user, {
          get: function (t, p) {
            if (p === "username") return replace;
            if (p === "globalName" && t.globalName === match) return replace;
            return t[p];
          }
        });
      }

      unpatches.push(after("getCurrentUser", UserStore, function (_args, ret) {
        return wrap(ret);
      }));
      unpatches.push(after("getUser", UserStore, function (_args, ret) {
        return wrap(ret);
      }));
    } catch (e) {
      console.error("[Larp] patchUsername failed", e);
    }
  }

  function patchBadges() {
    try {
      var mod = findByName("useBadges", false);
      if (!mod || typeof mod.useBadges !== "function") return;

      unpatches.push(after("useBadges", mod, function (_args, ret) {
        var current = Array.isArray(ret) ? ret.slice() : [];
        var ids = Object.keys(storage.badges || {});
        for (var i = 0; i < BADGES.length; i++) {
          var b = BADGES[i];
          if (storage.badges[b.id]) {
            current.unshift(makeBadgePayload(b));
          }
        }
        return current;
      }));
    } catch (e) {
      console.error("[Larp] patchBadges failed", e);
    }
  }

  // ---------------------------------------------------------------------
  // Settings UI (React.createElement only, NO JSX).
  // ---------------------------------------------------------------------
  function Settings() {
    var s = React.useState(0);
    var force = s[1];

    function refresh() { force(function (n) { return n + 1; }); }

    var matchValue = storage.matchUsername || "";
    var replaceValue = storage.replaceUsername || "";

    function field(label, value, key) {
      return React.createElement(View, { style: { marginBottom: 16 } },
        React.createElement(Text, {
          style: { color: "#dbdee1", fontSize: 14, fontWeight: "600", marginBottom: 6 }
        }, label),
        React.createElement(TextInput, {
          style: {
            backgroundColor: "#1e1f22",
            color: "#ffffff",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16
          },
          placeholder: label,
          placeholderTextColor: "#80848e",
          value: value,
          autoCorrect: false,
          autoCapitalize: "none",
          onChangeText: function (v) {
            storage[key] = v;
            refresh();
          }
        })
      );
    }

    function badgeRow(b) {
      var on = !!storage.badges[b.id];
      return React.createElement(Pressable, {
        key: b.id,
        onPress: function () {
          storage.badges[b.id] = !on;
          refresh();
          try {
            showToast(
              (on ? "Removed " : "Added ") + b.label,
              getAssetIDByName(on ? "Small" : "Check")
            );
          } catch (_) {}
        },
        style: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: on ? "#404652" : "#2b2d31",
          borderRadius: 8,
          marginBottom: 6
        }
      },
        React.createElement(Text, {
          style: { color: on ? "#5865f2" : "#80848e", fontSize: 18, marginRight: 12 }
        }, on ? "☑" : "☐"),
        React.createElement(Text, {
          style: { color: "#ffffff", fontSize: 15, flex: 1 }
        }, b.label)
      );
    }

    return React.createElement(ScrollView, {
      style: { flex: 1, backgroundColor: "#313338" },
      contentContainerStyle: { padding: 16, paddingBottom: 64 }
    },
      React.createElement(Text, {
        style: { color: "#ffffff", fontSize: 22, fontWeight: "700", marginBottom: 4 }
      }, "Larp"),
      React.createElement(Text, {
        style: { color: "#b5bac1", fontSize: 13, marginBottom: 20 }
      }, "100% local. Personne d'autre ne voit ces changements."),

      field("User to replace", matchValue, "matchUsername"),
      field("Replacement", replaceValue, "replaceUsername"),

      React.createElement(Text, {
        style: {
          color: "#dbdee1",
          fontSize: 14,
          fontWeight: "600",
          marginTop: 8,
          marginBottom: 10
        }
      }, "Badges (tap to toggle)"),

      BADGES.map(badgeRow),

      React.createElement(Pressable, {
        onPress: function () {
          storage.badges = {};
          refresh();
          try { showToast("All badges cleared", getAssetIDByName("trash")); } catch (_) {}
        },
        style: {
          marginTop: 12,
          padding: 12,
          backgroundColor: "#da373c",
          borderRadius: 8,
          alignItems: "center"
        }
      },
        React.createElement(Text, {
          style: { color: "#ffffff", fontWeight: "600" }
        }, "Clear all badges")
      )
    );
  }

  // ---------------------------------------------------------------------
  // Plugin object — this is what Kettu's evalPlugin returns.
  // ---------------------------------------------------------------------
  return {
    onLoad: function () {
      try { showToast("Larp loaded", getAssetIDByName("Check")); } catch (_) {}
      patchUsername();
      patchBadges();
    },
    onUnload: function () {
      for (var i = 0; i < unpatches.length; i++) {
        try { unpatches[i](); } catch (_) {}
      }
      unpatches = [];
    },
    settings: Settings
  };
})()

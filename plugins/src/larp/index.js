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
  /** Official Discord SVGs for evolved Nitro tiers (mezotv/discord-badges README). */
  var SVG_EMERALD = "https://discord.com/assets/f2b9b02fb22cc6459922.svg";
  var SVG_RUBY = "https://discord.com/assets/ecf86e18838013c9d95a.svg";
  var SVG_OPAL = "https://discord.com/assets/b4fc7a9c37ec2fae36e3.svg";

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
    {
      id: "premium",
      label: "Discord Nitro (icône générique)",
      assetCandidates: ["NitroSubscriberBadge", "NitroSubscriber", "PremiumSubscriberBadge", "SubscriberBadge"],
      url: CDN + "/2ba85e8026a8614b640c2837bcdfe21b.png"
    },
    { id: "premium_tenure_3_month",  label: "Nitro · ~3 mo (bronze)",   assetCandidates: ["NitroBronzeBadge", "NitroBronze", "premium_tenure_03_month_v2"], url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "premium_tenure_6_month",  label: "Nitro · ~6 mo (argent)",   assetCandidates: ["NitroSilverBadge", "NitroSilver", "premium_tenure_06_month_v2"], url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "premium_tenure_12_month", label: "Nitro · ~12 mo (or)",      assetCandidates: ["NitroGoldBadge", "NitroGold", "premium_tenure_12_month_v2"], url: CDN + "/d92998916f4ce6f74de7da0a37b8d740.png" },
    { id: "premium_tenure_24_month", label: "Nitro · ~24 mo (platine)", assetCandidates: ["NitroPlatinumBadge", "NitroPlatinum", "premium_tenure_24_month_v2"], url: CDN + "/9d4f73ca6df09bc63a39ea84d5fd0ff5.png" },
    { id: "premium_tenure_36_month", label: "Nitro · ~36 mo (diamant)", assetCandidates: ["NitroDiamondBadge", "NitroDiamond", "premium_tenure_36_month_v2"], url: CDN + "/65d6d6df9d56b8c3f4b3b1f3e4f3a0c8.png" },
    {
      id: "premium_tenure_emerald",
      label: "Nitro · Emerald (36 mo)",
      assetCandidates: ["NitroEmeraldBadge", "NitroEmerald", "EmeraldNitroBadge", "premium_tenure_36_month_v2"],
      url: SVG_EMERALD
    },
    {
      id: "premium_tenure_ruby",
      label: "Nitro · Ruby (60 mo)",
      assetCandidates: ["NitroRubyBadge", "NitroRuby", "RubyNitroBadge", "premium_tenure_60_month_v2"],
      url: SVG_RUBY
    },
    {
      id: "premium_tenure_opal",
      label: "Nitro · Opal (72+ mo)",
      assetCandidates: ["NitroOpalBadge", "NitroOpal", "NitroFireBadge", "FireNitroBadge", "premium_tenure_72_month_v2"],
      url: SVG_OPAL
    },
    { id: "bot_commands",            label: "Supports Commands",        asset: "BotCommandsBadge",                 url: CDN + "/6f9e37f9029ff57aef81db857890005e.png" },
    { id: "automod",                 label: "Uses AutoMod",             asset: "AutoModBadge",                     url: CDN + "/f2459b691ac7453ed6039bbcfaccbfcd.png" },
    { id: "legacy_username",         label: "Originally Known As",      asset: "LegacyUsernameBadge",              url: CDN + "/6de6d34650760ba5551a79732e98ed60.png" },
    { id: "quest",                   label: "Completed a Quest",        asset: "QuestBadge",                       url: CDN + "/7d9ae358c8c5e118768335dbe68b4fb8.png" }
  ];

  /** Highest wins when several Nitro rows are toggled on. */
  var NITRO_LARP_ORDER = [
    "premium_tenure_opal",
    "premium_tenure_ruby",
    "premium_tenure_emerald",
    "premium_tenure_36_month",
    "premium_tenure_24_month",
    "premium_tenure_12_month",
    "premium_tenure_6_month",
    "premium_tenure_3_month",
    "premium"
  ];
  var NITRO_LARP_SET = {};
  for (var _ni = 0; _ni < NITRO_LARP_ORDER.length; _ni++) {
    NITRO_LARP_SET[NITRO_LARP_ORDER[_ni]] = true;
  }

  /** CDN + label for each synthetic badge id (used by JSX hook below). */
  var LARP_BADGE_META = {};
  for (var _bi = 0; _bi < BADGES.length; _bi++) {
    var _bb = BADGES[_bi];
    LARP_BADGE_META["larp-" + _bb.id] = { uri: _bb.url, label: _bb.label };
  }

  function collectAssetNames(b) {
    var out = [];
    if (b.assetCandidates) {
      for (var _ci = 0; _ci < b.assetCandidates.length; _ci++) {
        out.push(b.assetCandidates[_ci]);
      }
    }
    if (b.asset) out.push(b.asset);
    return out;
  }

  function firstResolvedAsset(names) {
    if (!names || !names.length) return null;
    for (var _ai = 0; _ai < names.length; _ai++) {
      try {
        var _id = getAssetIDByName(names[_ai]);
        var _num =
          typeof _id === "number"
            ? _id
            : typeof _id === "string"
              ? parseInt(_id, 10)
              : NaN;
        if (!isNaN(_num) && isFinite(_num)) return _num;
      } catch (_e) {}
    }
    return null;
  }

  function makeBadgePayload(b) {
    var assetNum = firstResolvedAsset(collectAssetNames(b));
    if (assetNum != null) {
      return {
        id: "larp-" + b.id,
        description: b.label,
        icon: assetNum,
        source: assetNum
      };
    }
    return {
      id: "larp-" + b.id,
      description: b.label,
      icon: " "
    };
  }

  function getEnabledNitroLarpId() {
    var bm = getBadgesMap();
    for (var _ti = 0; _ti < NITRO_LARP_ORDER.length; _ti++) {
      var tid = NITRO_LARP_ORDER[_ti];
      if (bm[tid]) return tid;
    }
    return null;
  }

  function isGuildBoostBadge(b) {
    if (!b) return false;
    var id = String(b.id || "").toLowerCase();
    var desc = String(b.description || "").toLowerCase();
    if (id.indexOf("guild_booster") !== -1) return true;
    if (id.indexOf("premium_guild") !== -1) return true;
    if (desc.indexOf("server boost") !== -1) return true;
    if (desc.indexOf("guild boost") !== -1) return true;
    if (desc.indexOf("boosting") !== -1 && desc.indexOf("nitro") === -1) return true;
    return false;
  }

  /** True for Discord's real Nitro / tenure gems (not our larp- rows). */
  function isNativeNitroLike(b) {
    if (!b) return false;
    if (String(b.id || "").indexOf("larp-") === 0) return false;
    if (isGuildBoostBadge(b)) return false;
    var id = String(b.id || "").toLowerCase();
    var desc = String(b.description || "").toLowerCase();
    if (id.indexOf("nitro") !== -1 && id.indexOf("guild") === -1) return true;
    if (id.indexOf("premium") !== -1 && id.indexOf("guild") === -1) return true;
    if (id.indexOf("subscriber") !== -1 && desc.indexOf("nitro") !== -1) return true;
    if (desc.indexOf("discord nitro") !== -1) return true;
    if (desc.indexOf("nitro") !== -1 && /subscriber|since|month|year|tenure|bronze|silver|gold|platinum|diamond|emerald|ruby|opal|classic|basic/i.test(desc)) {
      return true;
    }
    return false;
  }

  function nativeNitroCount(arr) {
    var c = 0;
    for (var _nj = 0; _nj < arr.length; _nj++) {
      if (isNativeNitroLike(arr[_nj])) c++;
    }
    return c;
  }

  // ---------------------------------------------------------------------
  // Patches (applied in onLoad, released in onUnload).
  // ---------------------------------------------------------------------
  var unpatches = [];
  /** Cached UserStore reference (also used by badge patch). */
  var UserStoreRef = null;

  /** Trim, strip leading @, lowercase — for comparing usernames. */
  function normName(s) {
    if (s == null || typeof s !== "string") return "";
    var t = s.trim();
    if (t.charAt(0) === "@") t = t.slice(1);
    return t.toLowerCase();
  }

  function getBadgesMap() {
    var b = storage.badges;
    if (!b || typeof b !== "object") return {};
    return b;
  }

  /** One Proxy per underlying user object — avoids a new `{}` every Flux tick (that broke useMemo / updateMemo). */
  var wrapProxyByUser = new WeakMap();

  function shouldSpoofUser(user) {
    if (!user) return false;
    var match = normName(storage.matchUsername || "");
    var replace = (storage.replaceUsername || "").trim();
    if (!match || !replace) return false;
    var un = normName(user.username || "");
    var gn = normName(user.globalName || user.global_name || "");
    return un === match || gn === match;
  }

  function buildUserProxy(user) {
    var prev = wrapProxyByUser.get(user);
    if (prev) return prev;

    var proxy = new Proxy(user, {
      get: function (t, p, recv) {
        if (!shouldSpoofUser(t)) return Reflect.get(t, p, recv);
        var match = normName(storage.matchUsername || "");
        var replace = (storage.replaceUsername || "").trim();
        var un = normName(t.username || "");
        var gn = normName(t.globalName || t.global_name || "");

        if (p === "username") return replace;

        if (p === "globalName" || p === "global_name") {
          var orig = Reflect.get(t, p, recv);
          if (gn === match || un === match) return replace;
          return orig;
        }

        // "user#0" style tag shown under display name on mobile
        if (p === "tag") {
          var tag = Reflect.get(t, "tag", recv);
          if (typeof tag === "string") {
            var hash = tag.indexOf("#");
            if (hash !== -1) return replace + tag.slice(hash);
          }
        }

        return Reflect.get(t, p, recv);
      },
      ownKeys: function (t) {
        return Reflect.ownKeys(t);
      },
      getOwnPropertyDescriptor: function (t, p) {
        if (!shouldSpoofUser(t)) return Reflect.getOwnPropertyDescriptor(t, p);
        var replace = (storage.replaceUsername || "").trim();
        if (p === "username") {
          return {
            configurable: true,
            enumerable: true,
            value: replace
          };
        }
        if (p === "globalName" || p === "global_name") {
          var gn = normName(t.globalName || t.global_name || "");
          var un = normName(t.username || "");
          var match = normName(storage.matchUsername || "");
          if (gn === match || un === match) {
            return {
              configurable: true,
              enumerable: true,
              value: replace
            };
          }
        }
        return Reflect.getOwnPropertyDescriptor(t, p);
      }
    });
    wrapProxyByUser.set(user, proxy);
    return proxy;
  }

  function wrap(user) {
    if (!user) return user;
    if (!shouldSpoofUser(user)) return user;
    return buildUserProxy(user);
  }

  function patchUsername() {
    try {
      var UserStore = findByStoreName("UserStore");
      UserStoreRef = UserStore || null;
      if (!UserStore || typeof UserStore.getCurrentUser !== "function") return;

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
      // Kettu's own badges plugin patches `default` on the raw `useBadges`
      // module — the hook is module.default, NOT a named export `useBadges`.
      var mod = findByName("useBadges", false);
      if (!mod) return;
      var hookKey = typeof mod.default === "function" ? "default" : null;
      if (!hookKey && typeof mod.useBadges === "function") {
        hookKey = "useBadges";
      }
      if (!hookKey) return;

      function badgeHandler(args, ret) {
        if (!ret || !Array.isArray(ret)) return ret;
        var badgesMap = getBadgesMap();
        var hasAny = false;
        for (var k in badgesMap) {
          if (badgesMap[k]) {
            hasAny = true;
            break;
          }
        }
        if (!hasAny) {
          // Still strip stale larp-* if toggles were cleared
          var onlyReal = ret.filter(function (x) {
            return !x || !x.id || String(x.id).indexOf("larp-") !== 0;
          });
          return onlyReal.length === ret.length ? ret : onlyReal;
        }

        var u = args && args[0];
        var uid =
          (u && (u.userId || u.id)) ||
          (u && u.user && (u.user.id || u.user.userId));
        var cur =
          UserStoreRef &&
          UserStoreRef.getCurrentUser &&
          UserStoreRef.getCurrentUser();
        var curId = cur && cur.id;
        if (!uid || !curId || String(uid) !== String(curId)) return ret;

        // CRITICAL: never unshift onto `ret` repeatedly — useBadges runs on
        // every render; duplicating entries grows the array until React
        // crashes inside updateMemo.
        var base = ret.filter(function (x) {
          return !x || !x.id || String(x.id).indexOf("larp-") !== 0;
        });

        var nitroPick = getEnabledNitroLarpId();
        var hasRealNitro = nativeNitroCount(base) > 0;
        var stripNativeNitro = nitroPick != null && hasRealNitro;
        var base2 = stripNativeNitro
          ? base.filter(function (x) {
              return !isNativeNitroLike(x);
            })
          : base;

        var additions = [];
        for (var i = 0; i < BADGES.length; i++) {
          var b = BADGES[i];
          if (!badgesMap[b.id]) continue;
          if (NITRO_LARP_SET[b.id] && b.id !== nitroPick) continue;
          additions.push(makeBadgePayload(b));
        }
        return base2.concat(additions);
      }

      unpatches.push(after(hookKey, mod, badgeHandler));
    } catch (e) {
      console.error("[Larp] patchBadges failed", e);
    }
  }

  /**
   * Same idea as Kettu's core badges plugin: remote badge rows from
   * useBadges need `props.source` applied when ProfileBadge / RenderedBadge
   * is actually created via the jsx runtime.
   */
  function patchBadgeIconsViaJsx() {
    try {
      var jsxRuntime = findByProps("jsx", "jsxs");
      if (!jsxRuntime) return;

      function onJsx(args, ret) {
        if (!ret || !ret.props) return ret;
        var Type = args[0];
        if (typeof Type !== "function") return ret;
        var n = Type.displayName || Type.name;
        if (n !== "ProfileBadge" && n !== "RenderedBadge") return ret;
        var id = ret.props.id;
        if (typeof id !== "string" || id.indexOf("larp-") !== 0) return ret;
        var meta = LARP_BADGE_META[id];
        if (!meta) return ret;
        ret.props.source = { uri: meta.uri };
        if (ret.props.description == null || ret.props.description === "") {
          ret.props.description = meta.label;
        }
        return ret;
      }

      unpatches.push(after("jsx", jsxRuntime, onJsx));
      unpatches.push(after("jsxs", jsxRuntime, onJsx));
    } catch (e) {
      console.error("[Larp] patchBadgeIconsViaJsx failed", e);
    }
  }

  // ---------------------------------------------------------------------
  // Settings UI (React.createElement only, NO JSX).
  // ---------------------------------------------------------------------
  function Settings() {
    var s = React.useState(0);
    var force = s[1];

    function refresh() {
      force(function (n) {
        return n + 1;
      });
      try {
        var us = findByStoreName("UserStore");
        if (us && typeof us.emitChange === "function") {
          us.emitChange();
        }
      } catch (_) {}
    }

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
      React.createElement(Text, {
        style: { color: "#949ba4", fontSize: 12, marginBottom: 12 }
      }, "Pseudo : ton vrai username Discord (sans @), la comparaison ignore majuscules/minuscules."),

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
      React.createElement(Text, {
        style: { color: "#949ba4", fontSize: 11, marginBottom: 8, lineHeight: 15 }
      }, "Nitro / paliers : si tu as déjà un vrai badge Nitro sur ton compte, Larp le retire et affiche celui que tu coches (un seul à la fois = le plus haut dans la liste). Si tu n'as pas Nitro, le badge choisi s'ajoute."),

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
      patchBadgeIconsViaJsx();
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

# Discord IPA (Kettu + KettuTweak)

Monorepo personnel pour builder un Discord iOS moddé avec [Kettu](https://github.com/C0C0B01/Kettu) (fork de Bunny) — sans Xcode local, via GitHub Actions.

## Structure

```
.
├── Kettu/                     # Code JS du mod (fork de C0C0B01/Kettu)
│   ├── src/                   # Source TS/TSX du mod
│   ├── scripts/build.mjs      # Script de build esbuild
│   └── package.json
├── KettuTweak/                # Tweak iOS Theos (fork de C0C0B01/KettuTweak)
│   ├── Sources/               # Hooks Objective-C / Logos
│   ├── Headers/
│   ├── Makefile               # Build Theos → produit un .deb
│   └── control                # Métadonnées package (Name, Version, etc.)
├── plugins/                   # Plugins externes pour Kettu
│   ├── src/<plugin-id>/       # Sources d'un plugin (manifest.json + code TS/TSX)
│   ├── build.mjs              # Bundle chaque plugin en IIFE pour le loader Kettu
│   ├── bunny-types.d.ts       # Déclarations TS du global `bunny`
│   └── builds/                # (généré) plugins compilés + repo.json
└── .github/workflows/
    ├── build-bundle.yml       # Build le JS Kettu + plugins → branche `dist`
    └── build-ipa.yml          # Build le tweak + injecte dans Discord IPA → IPA final
```

## Comment ça marche

1. **`Kettu`** = code TypeScript du mod. Compilé en `kettu.js` (un bundle ~512 KB).
2. **`KettuTweak`** = tweak iOS écrit en Objective-C/Logos. Il s'injecte dans Discord et hook `RCTCxxBridge.executeApplicationScript:` pour, avant que le bundle JS officiel de Discord ne se charge, télécharger et exécuter `kettu.js`.
3. Par défaut, le tweak télécharge le bundle depuis le repo Kettu upstream sur Codeberg. Tu peux le pointer vers **ton propre bundle** via les settings du tweak (Custom Load URL) — utile dès que tu commences à ajouter tes plugins.

> **Important** : le bundle JS n'est PAS embarqué dans l'IPA. L'IPA contient seulement le tweak. C'est pour ça qu'on peut rebuild le bundle sans rebuild l'IPA.

---

## Workflow d'installation (résumé)

```
[GitHub Action build-ipa.yml]
         │
         ├── Build KettuTweak.deb (Theos, macos-15)
         │
         ├── Télécharge Discord.ipa (déchiffré) depuis l'URL fournie
         │
         ├── Injecte le .deb avec `cyan` (pyzule)
         │
         └── Produit `Kettu.ipa` (non signé) en artifact
                     │
                     ▼
           [Téléchargement local sur ton PC]
                     │
                     ▼
        [Sideloadly avec ton Apple ID gratuit]
                     │
                     ▼
              [Discord moddé sur iPhone]
```

---

## Pré-requis

### Sur ton iPhone / iPad
- iOS 14+ (vérifier compat. avec KettuTweak)
- Une **provisioning** Apple ID (gratuit OK, sinon Apple Developer payant)

### Sur ton PC (Windows ou Mac)
- [**Sideloadly**](https://sideloadly.io/) installé
- Un Apple ID

### Sur GitHub
- Un compte
- Ce repo poussé en privé ou public (peu importe)

---

## Utilisation

### 1. Première installation

1. **Push ce monorepo sur ton GitHub** (instructions plus bas).
2. **Trouve l'URL d'un IPA Discord DÉCHIFFRÉ** (decrypted). Sources possibles :
   - `https://ipa.aldente.cloud/` (cherche "Discord")
   - `https://decrypt.day/`
   - Releases d'autres mods Discord iOS sur GitHub (Bunny, Enmity, etc. — ils ont parfois une release "Discord-decrypted.ipa")
   
   Copie le **lien direct** vers le fichier `.ipa` (qui finit par `.ipa`).

3. **Lance le workflow** :
   - GitHub → Actions → "Build Kettu IPA" → "Run workflow"
   - Colle l'URL dans `ipa_url`
   - Optionnel : coche "release" pour créer une GitHub Release auto

4. **Attends ~10-15 min**. Quand fini, télécharge l'artifact `Kettu-discord-X.X.X-ipa`.

5. **Décompresse le ZIP** → tu obtiens `Kettu.ipa`.

6. **Ouvre Sideloadly** :
   - Connecte ton iPhone
   - Drag & drop `Kettu.ipa` dans Sideloadly
   - Mets ton Apple ID
   - Clique "Start"
   - Approuve le profil sur ton iPhone (Réglages → Général → VPN et gestion d'appareil)

7. **Lance Discord moddé.** Le tweak télécharge le bundle Kettu depuis Codeberg au premier démarrage. Si tu vois le logo Kettu dans les paramètres → c'est gagné.

### 2. Pour utiliser ton propre bundle JS (custom plugins plus tard)

1. Modifie le code dans `Kettu/src/`
2. Commit + push → le workflow `build-bundle.yml` se déclenche tout seul
3. Il publie `kettu.js` sur la branche `dist` du repo
4. Dans Discord moddé sur iPhone :
   - Settings → General → Developer Settings (à activer)
   - Settings → Developer → "Load from custom URL"
   - Mets : `https://raw.githubusercontent.com/<TON_USER>/<TON_REPO>/dist/kettu.js`
5. Restart Discord

---

## Build local (optionnel, pour dev)

Pour build/tester le bundle JS en local sans push :

```sh
cd Kettu
bun install
bun run build         # Génère Kettu/dist/kettu.js
bun run serve         # Sert le bundle sur http://localhost:4040/kettu.js
```

Puis sur iPhone, mets `http://<ip-de-ton-pc>:4040/kettu.js` comme Custom Load URL.

Le tweak iOS lui ne peut pas être build localement sans macOS+Theos. C'est pour ça qu'on utilise GitHub Actions.

---

## Push sur GitHub (1ère fois)

```sh
git init -b main
git add .
git commit -m "init: Kettu monorepo + GHA workflows"
gh repo create discord-ipa --private --source=. --push
# OU sans gh-cli :
git remote add origin https://github.com/<TON_USER>/<TON_REPO>.git
git branch -M main
git push -u origin main
```

---

---

## Plugins externes

Ce monorepo héberge aussi un système de **plugins externes** (style Bunny) buildés en parallèle du bundle Kettu. Chaque plugin vit dans `plugins/src/<id>/` avec son `manifest.json` et son entrée `index.tsx`.

### Build local d'un plugin

```sh
cd plugins
bun install
node build.mjs            # produit plugins/builds/<plugin-id>/{manifest.json,index.js}
                          # et plugins/repo.json
node build.mjs --watch    # rebuild à chaque changement
```

### Ajouter un plugin au repo

1. `mkdir plugins/src/<mon-plugin>`
2. Y mettre :
   - `manifest.json` (cf. `plugins/src/larp/manifest.json` pour l'exemple)
   - `index.tsx` qui termine par `export default definePlugin({ start, stop, SettingsComponent })`
3. `node build.mjs`
4. Commit + push → la GHA `Build Kettu JS Bundle and Plugins` rebuild et republie sur la branche `dist`

### Plugin Larp (inclus)

Modifie localement ton apparence Discord (visible que par toi) :
- **Username / display name / discriminator** custom
- **Badges** à cocher/décocher (Staff, Partner, HypeSquad, Nitro, Active Developer, …)
- **Date de création** du compte

Tous les overrides sont 100 % locaux — rien n'est envoyé à Discord.

### Utiliser les plugins dans Kettu sur iPhone

> ⚠ Le repo doit être **public** pour que `raw.githubusercontent.com` réponde sans token. Soit :
>   - Rends le repo public (Settings → General → Change visibility)
>   - **OU** active GitHub Pages sur la branche `dist` et utilise l'URL `https://<user>.github.io/<repo>/plugins/repo.json`

1. Dans Discord moddé → Paramètres → **Plugins** → bouton **+** (ajouter un repo)
2. Colle : `https://raw.githubusercontent.com/hello156165-oss/discord-ipa/dist/plugins/repo.json`
3. Le plugin "Larp" apparaît dans la liste → installer → activer
4. Un nouvel onglet **"Larp"** apparaît dans les paramètres Discord → configure tes overrides

---

## Crédits

- **Kettu** par [@C0C0B01](https://github.com/C0C0B01) (BSD-3-Clause)
- **KettuTweak** par [@C0C0B01](https://github.com/C0C0B01)
- Forks/inspirations : Bunny, Pyoncord, Vendetta, Enmity

Voir `Kettu/LICENSE` et `KettuTweak/LICENSE` pour les licences originales.

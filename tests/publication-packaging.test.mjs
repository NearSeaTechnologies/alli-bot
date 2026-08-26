import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import createIgnore from "ignore";

import { resolvePackagedAppArtifacts } from "../scripts/lib/packaged-app.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("packaged verification authority is the selected app bundle", () => {
  const appPath = path.join(repoRoot, "dist", "Example.app");
  const artifacts = resolvePackagedAppArtifacts(appPath);
  assert.equal(artifacts.appPath, appPath);
  assert.equal(artifacts.asarPath, path.join(appPath, "Contents", "Resources", "app.asar"));
  assert.equal(artifacts.unpackedPath, `${artifacts.asarPath}.unpacked`);
  assert.notEqual(artifacts.asarPath, path.join(repoRoot, ".build", "app.asar"));
  assert.throws(() => resolvePackagedAppArtifacts(path.join(repoRoot, ".build", "app.asar")), /\.app bundle/);
});

test("publication ignore rules retain reconstructed frontend source", async () => {
  const ignoreRules = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
  assert.match(ignoreRules, /^\/recovered\/$/m);
  assert.doesNotMatch(ignoreRules, /^recovered\/$/m);
  const retained = "frontend/src/recovered/ui/sand-form-primitives.css";
  const matcher = createIgnore().add(ignoreRules);
  assert.equal(matcher.ignores(retained), false, `${retained} must remain addable in a fresh repository`);
  assert.equal(matcher.ignores("recovered/generated-output.txt"), true, "root recovery output must remain ignored");
});

test("default packaging keeps the polished checksum-pinned renderer", async () => {
  const source = await readFile(path.join(repoRoot, "scripts", "package-macos.mjs"), "utf8");
  const pack = await readFile(path.join(repoRoot, "scripts", "lib", "package-reconstructed-app.mjs"), "utf8");
  const reload = await readFile(path.join(repoRoot, "scripts", "reload-alli-bot.mjs"), "utf8");
  const install = await readFile(path.join(repoRoot, "scripts", "install-patched-alli-bot.sh"), "utf8");
  assert.match(source, /packageReconstructedMacApp\(\{ createDmg: true \}\)/);
  assert.match(pack, /import \{ buildFidelityReconstructedAsar \} from "\.\.\/clean-build\.mjs"/);
  assert.match(pack, /await buildFidelityReconstructedAsar\(\)/);
  assert.match(pack, /signPackagedApp\(appPath\)/);
  const identity = await readFile(path.join(repoRoot, "scripts", "lib", "alli-bot-identity.mjs"), "utf8");
  assert.match(identity, /alli-bot-icon-1024\.png/);
  assert.match(identity, /iconutil/);
  assert.match(pack, /createAlliDmg\(\{ appPath: outputApp, dmgPath: outputDmg \}\)/);
  const release = await readFile(path.join(repoRoot, "scripts", "lib", "macos-release.mjs"), "utf8");
  assert.match(release, /symlink\("\/Applications", path\.join\(staging, "Applications"\)\)/);
  assert.match(pack, /notarizeReleaseIfConfigured\(outputDmg\)/);
  assert.match(pack, /verifyAlliReleaseApp\(outputApp\)/);
  assert.match(pack, /installedAlliBotApp/);
  assert.match(reload, /installReconstructedApp/);
  assert.match(reload, /--watch/);
  assert.doesNotMatch(install, /CFBundleName -string "Grok Bot"/);
});

test("Router settings use the trusted backend and display recorded inference usage", async (t) => {
  const rendererPatch = await readFile(path.join(repoRoot, "scripts", "lib", "router-renderer-patch.mjs"), "utf8");
  const preload = await readFile(path.join(repoRoot, "source", "electron-preload", "preload.ts"), "utf8");
  const mainEdge = await readFile(path.join(repoRoot, "source", "electron-main", "main-edge.ts"), "utf8");
  const inference = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "inference-service.ts"), "utf8");
  const cursorSession = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "cursor-session.ts"), "utf8");
  const cursorBackend = await readFile(path.join(repoRoot, "source", "shared", "node", "cursor-backend", "cursor-inference.ts"), "utf8");
  const providers = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "provider-session.ts"), "utf8");
  const grokAuth = await readFile(path.join(repoRoot, "source", "shared", "node", "inference-router-grok.ts"), "utf8");
  const codexDirect = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "codex-direct-responses.ts"), "utf8");
  const turnShell = await readFile(path.join(repoRoot, "source", "host", "runner", "turn-run-shell.ts"), "utf8");
  const coordinator = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "inference-router.ts"), "utf8");
  const coordinatorMain = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "main.ts"), "utf8");
  const mcpBridge = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "routed-mcp-bridge.ts"), "utf8");
  const localDocker = await readFile(path.join(repoRoot, "source", "electron-main", "box", "local-docker-host-connector.ts"), "utf8");
  assert.match(rendererPatch, /desktop\.agent\.getInferenceRouter\(\)/);
  assert.match(rendererPatch, /desktop\.agent\.setInferenceRouter\(n\)/);
  assert.match(rendererPatch, /desktop\.agent\.getBoxRuntime\(\)/);
  assert.doesNotMatch(rendererPatch, /setBoxRuntime/);
  assert.match(rendererPatch, /role:"switch"/);
  assert.match(rendererPatch, /Use sandbox computer/);
  assert.match(rendererPatch, /"aria-checked":!0,"aria-label":"Use sandbox computer",disabled:!0/);
  assert.doesNotMatch(rendererPatch, /mode:"remote"/);
  assert.match(rendererPatch, /onValueChange:l=>\{if\(l!==null\)void e\(l\)\}/);
  assert.match(rendererPatch, /desktop\.secrets\.upsert/);
  assert.doesNotMatch(rendererPatch, /settings\.router-provider\.v1/);
  assert.match(rendererPatch, /Usage for /);
  assert.match(rendererPatch, /Requests/);
  assert.match(rendererPatch, /Input tokens/);
  assert.match(rendererPatch, /Last used/);
  assert.match(rendererPatch, /Tracked activity/);
  assert.match(rendererPatch, /RRouterProviders\.filter/);
  assert.match(preload, /getInferenceRouter: \(\) => edge\("getInferenceRouter"\)/);
  assert.match(preload, /getHostPinnedAgents: \(\) => edge\("getHostPinnedAgents"\)/);
  assert.match(preload, /setHostPinnedAgents: \(payload: \{ readonly pinnedAgentIds: readonly string\[\] \}\) => edge\("setHostPinnedAgents", payload\)/);
  assert.match(preload, /getBoxRuntime: \(\) => edge\("getBoxRuntime"\)/);
  assert.match(preload, /pickComposerFilePayloads: async \(\) => \{/);
  assert.match(preload, /edge\("pickComposerFiles"\)/);
  assert.match(rendererPatch, /pickComposerFilePayloads/);
  assert.match(rendererPatch, /W\.openPicker\(\)/);
  assert.match(rendererPatch, /retry kickstart until the bot can introduce itself/);
  assert.doesNotMatch(rendererPatch, /Hey — introduce yourself/);
  // Agent liveness: the shipped renderer must keep the original's avatar animations,
  // typing dots and green working pip. These used to be patched out.
  // The Updates section owns Reset computer / Update computer / Update baseline.
  // Removing it left no way to reset or update the sandbox from the UI.
  assert.match(rendererPatch, /\{id:"beta",label:"Updates",icon:"cloud-download"\}\]';/);
  assert.doesNotMatch(rendererPatch, /patchWorkingAvatarDots/);
  assert.doesNotMatch(rendererPatch, /keep bot image idle while working/);
  assert.doesNotMatch(rendererPatch, /do not overlay thinking dots on the bot image/);
  assert.doesNotMatch(rendererPatch, /show green indicator only while a bot is actually working/);
  assert.match(rendererPatch, /hide About menu item/);
  assert.match(rendererPatch, /rename sidebar Grok/);
  const onboarding = await readFile(path.join(repoRoot, "source/shared/agents/onboarding.ts"), "utf8");
  assert.match(onboarding, /Present yourself first/);
  const lifecycle = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  assert.match(lifecycle, /attempt < 20/);
  assert.match(lifecycle, /pendingKickstarts/);
  assert.match(lifecycle, /beginSessionRun\(session\)/);
  assert.match(providers, /distinct teammate inside/);
  assert.match(providers, /Never introduce yourself as Alli Bot or Grok Bot/);
  assert.match(providers, /join\(getSandRootDir\(\), "agents", agentId, "profile\.json"\)/);
  assert.doesNotMatch(providers, /active-agent\.json/);
  const boxRuntime = await readFile(path.join(repoRoot, "source", "shared", "box-runtime.ts"), "utf8");
  assert.match(boxRuntime, /export type SandBoxRuntime = "sandbox";/);
  assert.match(boxRuntime, /DEFAULT_SAND_BOX_RUNTIME: SandBoxRuntime = "sandbox"/);
  assert.doesNotMatch(boxRuntime, /local-docker/);
  assert.doesNotMatch(mainEdge, /resolveSandBoxRuntime|isSandBoxRuntime/);
  assert.match(rendererPatch, /teammatePickerSource/);
  assert.match(rendererPatch, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(rendererPatch, /"All","Productivity","Sales","Marketing","Ops","Success","Personal"/);
  assert.match(rendererPatch, /Search templates/);
  assert.match(rendererPatch, /merge botdirectory templates/);
  assert.match(rendererPatch, /ee\.current\|\|\(s\(\),o\(\),N\(\),W\.open\(\)\)/);
  const officialRendererPath = path.join(repoRoot, "src", "app", "dist", "renderer", "assets", "index-UbX-y3il.js");
  if (!existsSync(officialRendererPath)) {
    t.skip("needs npm run bootstrap");
    return;
  }
  const officialRenderer = await readFile(officialRendererPath, "utf8");
  assert.equal(officialRenderer.split("ee.current||(s(),o(),N(),W.open())").length - 1, 1);
  assert.equal(officialRenderer.split("ee.current||(s(),o(),N(),W.openPicker())").length - 1, 0);
  const { patchOriginalComposerFilePicker, patchOriginalComposerFileStage } = await import("../scripts/lib/router-renderer-patch.mjs");
  const patchedPicker = patchOriginalComposerFileStage(patchOriginalComposerFilePicker(officialRenderer));
  assert.match(patchedPicker, /Search templates/);
  assert.match(patchedPicker, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(patchedPicker, /"All","Productivity","Sales","Marketing","Ops","Success","Personal"/);
  assert.match(patchedPicker, /multi-account-content-desk/);
  assert.match(patchedPicker, /W\.openPicker\(\)/);
  // Patching must not flatten the persona animation map, delete the typing dots,
  // or narrow the green working indicator - that is what made the app look dead.
  assert.match(patchedPicker, /const tln=\{thinking:"thinking",searching:"searching"/);
  assert.match(patchedPicker, /children:p\.jsx\(ANe,\{size:"sm"\}\)\}\):null/);
  assert.match(patchedPicker, /A_t=\{thinking:"dots",orbit:"orbit"/);
  assert.match(patchedPicker, /function xge\(n\)\{return n\.awaitingUserResponse==null&&n\.isRunning\|\|KCe\(n\)\}/);
  assert.match(patchedPicker, /p\.jsx\(ANe,\{size:kJn\}\)/);
  // the kickstart retry fix must survive alongside the restored animations
  assert.match(patchedPicker, /for\(let k=0;k<20;k\+\+\)/);
  const leftoverOpenPicker = officialRenderer.replaceAll("ee.current||(s(),o(),N(),W.open())", "ee.current||(s(),o(),N(),W.openPicker())");
  const recoveredPicker = patchOriginalComposerFileStage(patchOriginalComposerFilePicker(leftoverOpenPicker));
  assert.match(recoveredPicker, /Search templates/);
  assert.match(recoveredPicker, /multi-account-content-desk/);
  assert.match(recoveredPicker, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(rendererPatch, /Mn=async\(\)=>\{try\{const pick=window\.desktop\?\.pickComposerFilePayloads/);
  assert.match(rendererPatch, /vft\(file\.path,file\.name\)/);
  assert.match(rendererPatch, /const c=new Uint8Array\(await i\.arrayBuffer\(\)\);let bin=/);
  assert.match(rendererPatch, /b\.stageAttachmentBytes\(\{filename:we,bytes:Pe,bytesBase64:/);
  assert.doesNotMatch(preload, /setBoxRuntime/);
  const rpcMain = await readFile(path.join(repoRoot, "source", "shared", "rpc", "main.ts"), "utf8");
  assert.match(rpcMain, /getBoxRuntime: \{ args: "none" \}/);
  assert.doesNotMatch(rpcMain, /setBoxRuntime/);
  assert.match(mainEdge, /syncHostSettingsToBox\(\{ inferenceProvider: provider \}\)/);
  assert.match(mainEdge, /invoke\(deps\.settingsStore, "setInferenceProvider", provider\)/);
  assert.match(mainEdge, /return \{ provider, usage:/);
  assert.match(mainEdge, /invoke\(deps\.boxRecovery, "restartCoordinator"\)/);
  assert.match(mainEdge, /getBoxRuntime: async \(\) => \(\{ mode: "sandbox", status: await getSandboxStatus\(String\(Reflect\.get\(deps\.settingsStore, "settingsPath"\)\)\) \}\)/);
  assert.doesNotMatch(mainEdge, /setBoxRuntime|startLocalDockerBox|getLocalDockerStatus|"local-docker"/);
  const settingsStore = await readFile(path.join(repoRoot, "source", "shared", "node", "settings", "sand-settings-store.ts"), "utf8");
  assert.match(settingsStore, /migrateLegacyBoxRuntime\(\)/);
  assert.match(settingsStore, /getBoxRuntime\(\): SandBoxRuntime \{ return DEFAULT_SAND_BOX_RUNTIME; \}/);
  assert.doesNotMatch(settingsStore, /migrateLegacyRemoteBoxRuntime/);
  const bindingProviders = await readFile(path.join(repoRoot, "source", "electron-main", "production-binding-providers.ts"), "utf8");
  assert.match(bindingProviders, /settingsStore\.migrateLegacyBoxRuntime\(\)/);
  assert.match(coordinator, /onTextDelta,\s*agentId/);
  assert.match(localDocker, /public\.ecr\.aws\/k0i0n2g5\/cursorenvironments\/universal:sand-box-latest/);
  assert.match(localDocker, /SANDBOX_GATEWAY_URL = "http:\/\/127\.0\.0\.1:1340"/);
  assert.match(localDocker, /connect: async \(\) => await connectSandboxBox\(settings\.settingsPath\),/);
  assert.doesNotMatch(localDocker, /runCommand\("docker"|stopLocalDockerBox|inspectContainer|LOCAL_DOCKER_/, "the desktop must never touch a local Docker daemon");
  assert.match(localDocker, /"local-docker-vm\.json"/, "the shared gateway token file keeps its historical name");
  assert.match(localDocker, /recreate: async \(\): Promise<RecreateResult> => await updateSandboxBox\(settings\.settingsPath\)/);
  assert.match(localDocker, /forceRecreate: async \(\): Promise<RecreateResult> => await resetSandboxBox\(settings\.settingsPath\)/);
  assert.doesNotMatch(localDocker, /local-docker"|ensureLocalDockerBox|startLocalDockerBox|getLocalDockerStatus|stageCurrentHostBundle|localAuthMountArguments|getBoxRuntime\(\)|remote\.connect\(\)/);
  assert.match(inference, /recordInferenceUsage\(provider/);
  assert.match(inference, /routerSettings\.getInferenceProvider\(\)/);
  assert.match(inference, /typeof extendedUsage\.then === "function"/);
  assert.match(inference, /createProviderPromptSession\(provider\)/);
  assert.match(providers, /https:\/\/chatgpt\.com\/backend-api\/codex/);
  assert.match(providers, /headers\.set\("ChatGPT-Account-Id", credentials\.accountId\)/);
  assert.match(providers, /streamCodexDirectResponses/);
  assert.doesNotMatch(providers, /provider\.responses\(configuredCodexModel\(\)\)/);
  assert.match(codexDirect, /store: false/);
  assert.match(codexDirect, /response\.output_text\.delta/);
  assert.match(codexDirect, /type: "function_call_output"/);
  assert.match(providers, /parameters: jsonSchema\(parameters\)/);
  assert.match(providers, /You are \$\{SAND_PRODUCT_DISPLAY_NAME\}, a warm, concise desktop assistant/);
  assert.match(providers, /ask which email or account before calling its tools/);
  assert.match(providers, /call AskQuestion so it renders as a question card/);
  assert.match(providers, /mcpServers: \{ grok_bot_plugins:/);
  assert.match(providers, /recordRoutedUsage\(provider, usage\)/);
  assert.match(providers, /queryClaude/);
  assert.match(providers, /tools: mcpServerUrl == null \? \[\] : \["mcp__grok_bot_plugins__\*"\]/);
  assert.match(providers, /allowedTools: \["mcp__grok_bot_plugins__\*"\]/);
  assert.match(providers, /canUseTool:/);
  assert.match(coordinator, /resolveLocalToolPermission/);
  assert.match(coordinator, /resolveAutoReviewApproval/);
  assert.match(coordinator, /auto-review-approval/);
  assert.match(coordinator, /ASK_QUESTION_TOOL_NAME = "AskQuestion"/);
  assert.match(coordinator, /PROMPT_CONNECTORS_TOOL_NAME = "PromptConnectors"/);
  assert.match(coordinator, /sandWidgetSchema\.safeParse/);
  assert.match(coordinator, /dismissOnMoveOn/);
  assert.doesNotMatch(coordinator, /Add another \$\{/);
  assert.match(providers, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(providers, /OpenRouter needs OPENROUTER_API_KEY/);
  assert.match(providers, /GROK_API_BASE_URL/);
  assert.match(providers, /loadGrokCredentials/);
  assert.match(grokAuth, /https:\/\/api\.x\.ai\/v1/);
  assert.match(grokAuth, /https:\/\/auth\.x\.ai\/oauth2\/token/);
  assert.match(rendererPatch, /value:"grok"/);
  assert.match(rendererPatch, /provider:"claude-code"/);
  assert.doesNotMatch(rendererPatch, /value:"cursor"/);
  assert.match(cursorSession, /routedProvider !== "cursor"/);
  assert.match(cursorSession, /createProviderPromptSession\(routedProvider\)/);
  assert.match(cursorBackend, /routedProvider !== "cursor"/);
  assert.match(cursorBackend, /createProviderPromptSession\(routedProvider\)/);
  assert.doesNotMatch(rendererPatch, /ANTHROPIC_API_KEY|OPENAI_API_KEY/);
  assert.match(turnShell, /inferenceProvider === "cursor"/);
  assert.match(turnShell, /createProviderPromptSession\(inferenceProvider, input\.conversationId\)/);
  assert.match(coordinator, /method !== "sendPrompt" \|\| provider === "cursor"/);
  assert.match(coordinator, /if \(method === "createAgent"\) return \{ handled: false \}/);
  assert.doesNotMatch(coordinator, /rememberLocalNewBot|createLocalNewBotAgent/);
  assert.match(coordinator, /executeTool: async \(definition, toolArgs, toolCallId\) => await executePluginTool/);
  assert.match(coordinator, /callTool: async tool => \{/);
  assert.match(coordinatorMain, /command\(commands, "listRoutedMcpTools", args\)/);
  const productionProvider = await readFile(path.join(repoRoot, "source", "electron-main", "coordinator", "production-provider.ts"), "utf8");
  assert.match(productionProvider, /annotateRoutedMcpTool/);
  assert.doesNotMatch(productionProvider, /status\.email/);
  assert.match(coordinator, /inference-router-transcript\.json/);
  assert.match(mcpBridge, /openWorldHint: !readOnly/);
  assert.match(coordinator, /schemaVersion: 2/);
  assert.match(coordinator, /\["getAgentTranscriptTail", "openAgentTail", "getAgentTranscriptWindow"\]/);
  assert.match(coordinator, /\.map\(projectInferenceRouterTranscriptEntry\)/);
  assert.match(coordinator, /readonly richText\?: string/);
  assert.match(coordinator, /richText: entry\.richText/);
  assert.match(coordinator, /schedule\(resolve, composeDelayMs\)/);
  assert.match(coordinator, /createPacedTextReveal/);
  assert.match(coordinator, /emitAssistant\("", true\)/);
  assert.match(providers, /includePartialMessages: true/);
  assert.match(providers, /claudeStreamTextDelta/);
  assert.match(coordinator, /executePluginTool/);
  assert.match(coordinator, /askPluginPermission/);
  assert.match(coordinator, /sessionAllowedPlugins/);
  assert.match(coordinator, /pluginPermissionIdentity/);
  assert.match(coordinator, /method === "reactToMessage"/);
  assert.match(coordinator, /reaction\.by === "me"/);
  assert.match(coordinator, /currentActivity: \{ kind: "thinking" \}/);
  assert.match(coordinator, /onTextDelta/);
  assert.match(coordinator, /streaming/);
  assert.match(coordinator, /postEvent\("agents"/);
  assert.match(coordinator, /createRoutedMcpBridge/);
  assert.match(coordinator, /listRoutedMcpTools/);
  assert.match(coordinator, /executeRoutedMcpTool/);
  assert.match(mcpBridge, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(mcpBridge, /readOnlyHint: readOnly/);
  assert.match(mcpBridge, /request\.url !== `\/mcp\/\$\{secret\}`/);
  assert.match(coordinator, /kind: "send-message"/);
  assert.match(coordinatorMain, /createCoordinatorInferenceRouter/);
  assert.match(coordinatorMain, /routed\.handled/);
});

test("removal patches fail loudly instead of silently no-opping", async () => {
  const rendererPatch = await readFile(path.join(repoRoot, "scripts", "lib", "router-renderer-patch.mjs"), "utf8");
  // replaceOnceOrSkip skips when `source.includes(after)`. With a bare "null" as
  // the replacement that guard is trivially true for any bundle, so a drifted
  // anchor silently left the removed item in place. Each removal now carries a
  // distinctive sentinel so the guard means something.
  assert.doesNotMatch(rendererPatch, /^const \w+_AFTER = "null";$/m);
  assert.match(rendererPatch, /null\/\*sand-account-usage-removed\*\//);
  assert.match(rendererPatch, /null\/\*sand-ios-item-removed\*\//);
});

test("the application menu can reach About and Send Feedback", async () => {
  const menu = await readFile(path.join(repoRoot, "source", "electron-main", "application-menu.ts"), "utf8");
  // Both backends were wired the whole time; nothing could emit the events.
  assert.match(menu, /label: `About \$\{electron\.appName\}`, click: \(\) => options\.emitOpenAbout\(\)/);
  assert.match(menu, /label: "Send Feedback", click: \(\) => options\.emitOpenFeedback\(\)/);
});

test("notification settings are stored rather than forced off", async () => {
  const store = await readFile(path.join(repoRoot, "source", "shared", "node", "settings", "sand-settings-store.ts"), "utf8");
  // The setter used to ignore its argument and the getter overwrote the file.
  assert.doesNotMatch(store, /setNotificationConfig\(_input: unknown\)/);
  assert.match(store, /setNotificationConfig\(input: unknown\)/);
  assert.match(store, /normalizeNotificationConfig/);
});

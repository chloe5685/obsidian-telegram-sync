// TODO translating messages
// TODO notify in setting tab and bottom panel that new beta version is ready for installing
// TODO add messagesLeftCnt displaying in status bar
// TODO NEXT: sending notes from Obsidian to Telegram (only for insiders)
// TODO NEXT: ignore formatting (bold, italic, underline) in the notes names
// TODO MED:  "delete messages from Telegram" settings for each distribution rules
// TODO NEXT: save files if no template file
// TODO NEXT: no subscription, no enabled process old messages
// TODO NEXT: check reconnecting
// TODO NEXT: bug in connecting to Telegram Client https://t.me/alast0rm
// TODO NEXT: bur in reconnecting on MacBook https://t.me/sm1rnov_id
import { compareVersions } from "compare-versions";
export const releaseVersion = "3.2.0";
export const showNewFeatures = true;
export let showBreakingChanges = true;

const newFeatures = `In this release, the main change is that all processed messages will be marked with the reaction [👾] instead of replying with a separate message [...✅...].`;
export const breakingChanges = `⚠️ <b><i>You must grant your bot admin rights if you want to use reactions in groups and channels.</i></b> ⚠️`;
export const telegramChannelLink = "https://t.me/obsidian_telegram_sync";
const telegramChannelAHref = `<a href='${telegramChannelLink}'>channel</a>`;
const insiderFeaturesAHref = `<a href='${insiderFeaturesLink}'>exclusive insider features</a>`;
const telegramChannelIntroduction = `You can check the full list of new features in the plugin's ${telegramChannelAHref}! Subscription is free and gives you easy access to the latest beta versions and ${insiderFeaturesAHref}.`;
const telegramChatLink = "<a href='https://t.me/tribute/app?startapp=sfFf'>chat</a>";
const telegramChatIntroduction = `Join the plugin's ${telegramChatLink} - your space to seek advice, ask questions, and share knowledge (access via the @tribute bot).`;
const donation = `If you appreciate this plugin and would like to support its continued development, please consider donating through the buttons below or via Telegram Stars in the ${telegramChannelAHref}!`;
const bestRegards = "Best regards,\nYour soberhacker🍃🧘💻\n⌞";

export const privacyPolicyLink = "https://github.com/soberhacker/obsidian-telegram-sync/blob/main/PRIVACY-POLICY.md";
export const insiderFeaturesLink =
	"https://github.com/soberhacker/obsidian-telegram-sync/blob/main/docs/Telegram%20Sync%20Insider%20Features.md";

export const notes = `
<u><b>Telegram Sync ${releaseVersion}</b></u>\n
🆕 ${newFeatures}\n
💡 ${telegramChannelIntroduction}\n
💬 ${telegramChatIntroduction}\n
🦄 ${donation}\n
${bestRegards}`;

export function showBreakingChangesInReleaseNotes() {
	showBreakingChanges = true;
}

export function versionALessThanVersionB(versionA, versionB) {
	if (!versionA || !versionB) return undefined;
	return compareVersions(versionA, versionB) == -1;
}

const check = process.argv[2] === "check";

if (check) {
	const packageVersion = process.env.npm_package_version;

	if (packageVersion !== releaseVersion) {
		console.error(`Failed! Release notes are outdated! ${packageVersion} !== ${releaseVersion}`);
		process.exit(1);
	}
}

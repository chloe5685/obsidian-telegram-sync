import { TFile, normalizePath } from "obsidian";
import TelegramSyncPlugin from "../main";
import TelegramBot from "node-telegram-bot-api";
import { sanitizeFileName, getFileObject } from "./utils";
import { date2DateString, date2TimeString } from "src/utils/dateUtils";
import { createFolderIfNotExist } from "src/utils/fsUtils";
import { bugFixes, newFeatures, pluginVersion, possibleRoadMap } from "../../release-notes.mjs";
import { buyMeACoffeeLink, cryptoDonationLink, kofiLink, paypalLink } from "../settings/donation.js";
import { SendMessageOptions } from "node-telegram-bot-api";
import path from "path";
import * as gram from "./GramJs/client";
import { extension } from "mime-types";
import { applyTemplate, finalizeMessageProcessing } from "./messageProcessors";
import { createProgressBar, deleteProgressBar, updateProgressBar } from "./progressBar";

// handle all messages from Telegram
export async function handleMessage(plugin: TelegramSyncPlugin, msg: TelegramBot.Message) {
	let formattedContent = "";

	if (!msg.text || msg.text == "") {
		await handleFiles(plugin, msg);
		return;
	}

	// Check if message has been sended by allowed usernames
	const telegramUserName = msg.from?.username ?? "";
	const allowedChatFromUsernames = plugin.settings.allowedChatFromUsernames;

	if (!telegramUserName || !allowedChatFromUsernames.includes(telegramUserName)) {
		plugin.bot?.sendMessage(
			msg.chat.id,
			`Access denied. Add your username ${telegramUserName} in the plugin setting "Allowed Chat From Usernames".`,
			{ reply_to_message_id: msg.message_id }
		);
		return;
	}

	const rawText = msg.text;
	const location = plugin.settings.newNotesLocation || "";
	await createFolderIfNotExist(plugin.app.vault, location);

	const messageDate = new Date(msg.date * 1000);
	const messageDateString = date2DateString(messageDate);
	const messageTimeString = date2TimeString(messageDate);

	formattedContent = await applyTemplate(plugin, plugin.settings.templateFileLocation, msg);

	const appendAllToTelegramMd = plugin.settings.appendAllToTelegramMd;

	if (appendAllToTelegramMd) {
		plugin.messageQueueToTelegramMd.push({ msg, formattedContent });
		return;
	} else {
		const title = sanitizeFileName(rawText.slice(0, 20));
		let fileName = `${title} - ${messageDateString}${messageTimeString}.md`;
		let notePath = normalizePath(location ? `${location}/${fileName}` : fileName);
		while (
			plugin.listOfNotePaths.includes(notePath) ||
			plugin.app.vault.getAbstractFileByPath(notePath) instanceof TFile
		) {
			const newMessageTimeString = date2TimeString(messageDate);
			fileName = `${title} - ${messageDateString}${newMessageTimeString}.md`;
			notePath = normalizePath(location ? `${location}/${fileName}` : fileName);
		}
		plugin.listOfNotePaths.push(notePath);
		await plugin.app.vault.create(notePath, formattedContent);
		await finalizeMessageProcessing(plugin, msg);
	}
}

// Handle files received in messages
export async function handleFiles(plugin: TelegramSyncPlugin, msg: TelegramBot.Message) {
	if (!plugin.bot) return;

	const basePath = plugin.settings.newFilesLocation || plugin.settings.newNotesLocation || "";
	await createFolderIfNotExist(plugin.app.vault, basePath);
	let filePath: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let error: any;

	const messageDate = new Date(msg.date * 1000);
	const messageDateString = date2DateString(messageDate);
	const messageTimeString = date2TimeString(messageDate);

	try {
		// Iterate through each file type
		const { fileType, fileObject } = getFileObject(msg);
		const fileObjectToUse = fileObject instanceof Array ? fileObject.pop() : fileObject;
		const fileId = fileObjectToUse.file_id;
		let fileByteArray: Uint8Array;
		let telegramFileName: string;
		try {
			const fileLink = await plugin.bot.getFileLink(fileId);
			telegramFileName = fileLink?.split("/").pop() || "";
			const fileStream = plugin.bot.getFileStream(fileId);
			const fileChunks: Uint8Array[] = [];

			if (!fileStream) {
				return;
			}

			const progressBarMessage = await createProgressBar(plugin.bot, msg, "downloading");

			const totalBytes = fileObjectToUse.file_size;
			let receivedBytes = 0;
			let stage = 0;
			for await (const chunk of fileStream) {
				fileChunks.push(new Uint8Array(chunk));
				receivedBytes += chunk.length;
				stage = await updateProgressBar(plugin.bot, msg, progressBarMessage, totalBytes, receivedBytes, stage);
			}

			await deleteProgressBar(plugin.bot, msg, progressBarMessage);

			fileByteArray = new Uint8Array(
				fileChunks.reduce<number[]>((acc, val) => {
					acc.push(...val);
					return acc;
				}, [])
			);
		} catch (e) {
			if (e.message == "ETELEGRAM: 400 Bad Request: file is too big") {
				const media = await gram.downloadMedia(plugin.bot, msg, fileId, fileObjectToUse.file_size);
				//const fileBuffer = media instanceof Buffer ? media : Buffer.alloc(0);
				//fileByteArray = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
				fileByteArray = media instanceof Buffer ? media : Buffer.alloc(0);
				telegramFileName = `file_${sanitizeFileName(fileObject.file_unique_id)}`;
			} else {
				throw e;
			}
		}
		telegramFileName = (msg.document && msg.document.file_name) || telegramFileName;
		const fileExtension = path.extname(telegramFileName) || `.${extension(fileObject.mime_type)}`;
		const fileName = path.basename(telegramFileName, fileExtension);

		// Create a specific folder for each file type
		const specificFolder = `${basePath}/${fileType}s`;
		await createFolderIfNotExist(plugin.app.vault, specificFolder);
		// Format the file name and path
		const fileFullName = `${fileName} - ${messageDateString}${messageTimeString}${fileExtension}`;
		filePath = `${specificFolder}/${fileFullName}`;

		await plugin.app.vault.createBinary(filePath, fileByteArray);
	} catch (e) {
		error = e;
	}

	// Handle message captions and append to Telegram.md if necessary
	if ((msg.caption && !(msg.caption === "")) || plugin.settings.appendAllToTelegramMd) {
		const captionMd = !error
			? `![](${filePath?.replace(/\s/g, "%20")})\n${msg.caption || ""}`
			: `[❌ error while handling file](${error})\n${msg.caption || ""}`;

		const formattedContent = await applyTemplate(plugin, plugin.settings.templateFileLocation, msg, captionMd);
		if (plugin.settings.appendAllToTelegramMd) {
			plugin.messageQueueToTelegramMd.push({ msg, formattedContent, error });
			return;
		} else if (msg.caption) {
			// Save caption as a separate note
			const noteLocation = plugin.settings.newNotesLocation || "";
			await createFolderIfNotExist(plugin.app.vault, noteLocation);
			const title = sanitizeFileName(msg.caption.slice(0, 20));
			let fileCaptionName = `${title} - ${messageDateString}${messageTimeString}.md`;
			let notePath = normalizePath(noteLocation ? `${noteLocation}/${fileCaptionName}` : fileCaptionName);

			while (
				plugin.listOfNotePaths.includes(notePath) ||
				plugin.app.vault.getAbstractFileByPath(notePath) instanceof TFile
			) {
				const newMessageTimeString = date2TimeString(messageDate);
				fileCaptionName = `${title} - ${messageDateString}${newMessageTimeString}.md`;
				notePath = normalizePath(noteLocation ? `${noteLocation}/${fileCaptionName}` : fileCaptionName);
			}
			plugin.listOfNotePaths.push(notePath);
			await plugin.app.vault.create(notePath, formattedContent);
		}
	}

	await finalizeMessageProcessing(plugin, msg, error);
}

// show changes about new release
export async function ifNewRelaseThenShowChanges(plugin: TelegramSyncPlugin, msg: TelegramBot.Message) {
	const pluginVersionCode = pluginVersion.replace(/!/g, "");
	if (
		plugin.settings.pluginVersion &&
		plugin.settings.pluginVersion !== pluginVersionCode &&
		// warn user only when "!" sign is in pluginVersion
		pluginVersionCode != pluginVersion
	) {
		plugin.settings.pluginVersion = pluginVersionCode;
		plugin.saveSettings();
		const announcing = `<b>Telegrm Sync ${pluginVersionCode}</b>\n\n`;
		const newFeatures_ = `<u>New Features</u>${newFeatures}\n`;
		const bugsFixes_ = `<u>Bug Fixes</u>${bugFixes}\n`;
		const possibleRoadMap_ = `<u>Possible Road Map</u>${possibleRoadMap}\n`;
		const donation =
			"<b>If you like this plugin and are considering donating to support continued development, use the buttons below!</b>";
		const releaseNotes = announcing + newFeatures_ + bugsFixes_ + possibleRoadMap_ + donation;

		const options: SendMessageOptions = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[
						{ text: "🚀  Ð⟠na₮e crypto", url: cryptoDonationLink },
						{ text: "📖  Buy me a book", url: buyMeACoffeeLink },
					],
					[
						{ text: "☕  Ko-fi Donation", url: kofiLink },
						{ text: "💳  PayPal Donation", url: paypalLink },
					],
				],
			},
		};

		await plugin.bot?.sendMessage(msg.chat.id, releaseNotes, options);
	} else if (!plugin.settings.pluginVersion) {
		plugin.settings.pluginVersion = pluginVersionCode;
		plugin.saveSettings();
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Stages of progress while downloading VS Code */
export enum ProgressReportStage {
	/** Initial fetch of the latest version if not explicitly given */
	FetchingVersion = 'fetchingVersion',
	/** Always fired when the version is determined. */
	ResolvedVersion = 'resolvedVersion',
	/** Fired before fetching info about the latest Insiders version, when requesting insiders builds */
	FetchingInsidersMetadata = 'fetchingInsidersMetadata',
	/** Fired if the current Insiders is out of date */
	ReplacingOldInsiders = 'replacingOldInsiders',
	/** Fired when an existing install is found which does not require a download */
	FoundMatchingInstall = 'foundMatchingInstall',
	/** Fired before the URL to the download zip or tarball is looked up */
	ResolvingCDNLocation = 'resolvingCDNLocation',
	/** Fired continuously while a download happens */
	Downloading = 'downloading',
	/** Fired when the command is issued to do a synchronous extraction. May not fire depending on the platform and options. */
	ExtractingSynchonrously = 'extractingSynchonrously',
	/** Fired when the download fails and a retry will be attempted */
	Retrying = 'retrying',
	/** Fired after folder is downloaded and unzipped */
	NewInstallComplete = 'newInstallComplete',
}

export type ProgressReport =
	| { stage: ProgressReportStage.FetchingVersion }
	| { stage: ProgressReportStage.ResolvedVersion; version: string }
	| { stage: ProgressReportStage.FetchingInsidersMetadata }
	| {
			stage: ProgressReportStage.ReplacingOldInsiders;
			downloadedPath: string;
			oldHash: string;
			oldDate: Date;
			newHash: string;
			newDate: Date;
	  }
	| { stage: ProgressReportStage.FoundMatchingInstall; downloadedPath: string }
	| { stage: ProgressReportStage.ResolvingCDNLocation; url: string }
	| { stage: ProgressReportStage.Downloading; url: string; totalBytes: number; bytesSoFar: number }
	| { stage: ProgressReportStage.Retrying; error: Error; attempt: number; totalAttempts: number }
	| { stage: ProgressReportStage.ExtractingSynchonrously }
	| { stage: ProgressReportStage.NewInstallComplete; downloadedPath: string };

export interface ProgressReporter {
	report(report: ProgressReport): void;
	error(err: unknown): void;
}

/** Silent progress reporter */
export class SilentReporter implements ProgressReporter {
	report(): void {
		// no-op
	}

	error(): void {
		// no-op
	}
}

/** Default progress reporter that logs VS Code download progress to console */
export class ConsoleReporter implements ProgressReporter {
	private version?: string;

	private downloadReport?: {
		timeout: NodeJS.Timeout;
		report: { stage: ProgressReportStage.Downloading; totalBytes: number; bytesSoFar: number };
	};

	constructor(private readonly showDownloadProgress: boolean) {}

	public report(report: ProgressReport): void {
		switch (report.stage) {
			case ProgressReportStage.ResolvedVersion:
				this.version = report.version;
				break;
			case ProgressReportStage.ReplacingOldInsiders:
				console.log(`Removing outdated Insiders at ${report.downloadedPath} and re-downloading.`);
				console.log(`Old: ${report.oldHash} | ${report.oldDate.toISOString()}`);
				console.log(`New: ${report.newHash} | ${report.newDate.toISOString()}`);
				break;
			case ProgressReportStage.FoundMatchingInstall:
				console.log(`Found existing install in ${report.downloadedPath}. Skipping download`);
				break;
			case ProgressReportStage.ResolvingCDNLocation:
				console.log(`Downloading VS Code ${this.version} from ${report.url}`);
				break;
			case ProgressReportStage.Downloading:
				if (!this.showDownloadProgress && report.bytesSoFar === 0) {
					console.log(`Downloading VS Code (${report.totalBytes}B)`);
				} else if (!this.downloadReport) {
					this.downloadReport = { timeout: setTimeout(() => this.reportDownload(), 100), report };
				} else {
					this.downloadReport.report = report;
				}
				break;
			case ProgressReportStage.Retrying:
				this.flushDownloadReport();
				console.log(
					`Error downloading, retrying (attempt ${report.attempt} of ${report.totalAttempts}): ${report.error.message}`
				);
				break;
			case ProgressReportStage.NewInstallComplete:
				this.flushDownloadReport();
				console.log(`Downloaded VS Code into ${report.downloadedPath}`);
				break;
		}
	}

	public error(err: unknown) {
		console.error(err);
	}

	private flushDownloadReport() {
		if (this.showDownloadProgress) {
			this.reportDownload();
			console.log('');
		}
	}

	private reportDownload() {
		if (!this.downloadReport) {
			return;
		}

		const { totalBytes, bytesSoFar } = this.downloadReport.report;
		this.downloadReport = undefined;

		const percent = Math.max(0, Math.min(1, bytesSoFar / totalBytes));
		const progressBarSize = 30;
		const barTicks = Math.floor(percent * progressBarSize);
		const progressBar = '='.repeat(barTicks) + '-'.repeat(progressBarSize - barTicks);
		process.stdout.write(`\x1b[G\x1b[0KDownloading VS Code [${progressBar}] ${(percent * 100).toFixed()}%`);
	}
}

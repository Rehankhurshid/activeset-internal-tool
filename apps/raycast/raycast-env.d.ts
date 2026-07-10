/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** App Base URL - Base URL of the ActiveSet web app. */
  "baseUrl": string,
  /** Raycast API Token - Private token matching RAYCAST_API_TOKEN on the web app. */
  "apiToken": string,
  /** User Email - Your @activeset.co email for task attribution and review updates. */
  "userEmail"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `manage-projects` command */
  export type ManageProjects = ExtensionPreferences & {}
  /** Preferences accessible in the `create-task` command */
  export type CreateTask = ExtensionPreferences & {}
  /** Preferences accessible in the `open-project-link` command */
  export type OpenProjectLink = ExtensionPreferences & {}
  /** Preferences accessible in the `running-scans` command */
  export type RunningScans = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `manage-projects` command */
  export type ManageProjects = {}
  /** Arguments passed to the `create-task` command */
  export type CreateTask = {}
  /** Arguments passed to the `open-project-link` command */
  export type OpenProjectLink = {}
  /** Arguments passed to the `running-scans` command */
  export type RunningScans = {}
}


# GitHub Classroom Helper Bot

A GitHub App built with [Probot](https://github.com/probot/probot) to assist with various aspects of managing a GitHub Classroom.

> #### DISCLAIMER
>
> This app is ***not*** for general-purpose use, nor is it intended to be. If you decide to fork and adapt to your environment, please **do so *entirely* at your own discretion and risk, without *any* expectations of support.**

More specifically, this app was written to fill in perceived gaps in GitHub Classroom functionality for *specific* courses. It is work-in-progress (and probably always will be). Feel free to fork and/or "steal" anything you like. However, I do not have the time (or desire) to turn this into a "proper" general-purpose app. This includes (but is not limited to) the following implications: (a) the app is only tested in a specific environment and it may not even work at all as-is for others' Classroom setups, (b) no feature or API should ever be considered stable, (c) don't expect documentation ("use the source"), (d) pull requests will be considered (and appreciated) but, most likely, ignored (due to lack of time), unless if it's something very critical.

## Feature overview

The app is merely a collection of webhook event handlers. It is broadly divided into various independent "components":

* Watchdog: Basic sanity checking of commits pushed into assignment repositories. This is intended to prevent users from accidentally breaking pre-configured features in their workspace (e.g., IDE settings, unit tests, GitHub action and autograding configurations, etc etc)
* Badges: Update SVG badges to improve user experience.  Currently, only an autograding score badge is supported but others may be added in the future. These badges are currently stored in-repo (in an orphan branch) although that may change in future iterations.

**Planned features (no ETA):**

* [WIP] Autograding: Autograding currently relies on GitHub action workflows in the assignment repository, making it hard to have unit tests that are not released/revealed to students (beyond pass/fail outcome). Furthermore, the user experience (esp. for beginners) to see results is rather complicated.  This component relies on the check-run API and will allow: (a) running unit tests on a Docker image (on the bot server), and (b) using check-run annotations (combined with feedback PR) to improve UX.

## Setup/deploy notes

1. App is intended to be added to GitHub org (not individual users or repos). It's generally assumed that the org is used with GitHub Classroom.
2. The GitHub org should have a `.github` repo, with classbot configuration files in it's `.github` folder.  This includes global configuration (`.github/classbot.yml`) and per-assignment overrides (<code>.github/classbot-<i>hwname</i>.yml</code>).
3. In addition to Probot configuration, `.env` should also contain:
    * The bot username and userid (`CLASSBOT_USERNAME` and `CLASSBOT_USERID`). These are (currently) needed by `badges`. Ideally these should be obtained automatically but, for now, they *must* be manually configured.
    * Regex patterns for repos that classbot won't ignore (`CLASSBOT_REPO_OWNER_PATTERN` and `CLASSBOT_REPO_NAME_PATTERN`; *highly* recommended, esp. if deploying on a resource-limited VM...)
    * [WIP] Database connection settings.

## Assignment template repo notes

1. Assignment repository prefixes should *not* contain dashes.  We typically use repo prefixes of the form <code><i>hwN</i></code> (where N is the assignment number).
2. If `badges` is used, then the template repo *must* have an orphan `status` branch.

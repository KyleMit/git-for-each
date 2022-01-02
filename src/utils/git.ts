import { cmd, filterAsync, getDirectories, getDirectoryName, trimNewLines, trimWhitespace, tryCmd } from "."
import { IDiffCommitCount, IGitStatus, IModifiedCount, IShortStatusInfo } from "../models";




export const getGitShortStatus = async (path: string): Promise<IShortStatusInfo> => {
    // https://git-scm.com/docs/git-status
    try {
        const resp = await cmd(`git -C ${path} status -s`)
        return { status: trimNewLines(resp) }
    } catch (error) {
        return { status: "", tooManyChanges: true}
    }

}

export const getCurrentBranch = async (path: string): Promise<string> => {
    // https://git-scm.com/docs/git-branch#Documentation/git-branch.txt---show-current
    const resp = await cmd(`git -C ${path} branch --show-current`)
    return trimWhitespace(resp) || 'Detached Head'
}

export const getModifiedCounts = async (path: string): Promise<IModifiedCount> => {
    // https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---shortstat
    const [stats] = await tryCmd(`git -C ${path} diff --shortstat`)

    // if there's no line, there are no changes
    if (!stats) { return {files: 0, insertions: 0, deletions: 0} }

    // ex. 4 files changed, 15 insertions(+), 5 deletions(-)
    // ex. 8 files changed, 595 deletions(-)
    const files = Number(stats.match(/(\d+) files/)?.[1] || 0)
    const insertions = Number(stats.match(/(\d+) insertions/)?.[1] || 0)
    const deletions = Number(stats.match(/(\d+) deletions/)?.[1] || 0)

    return { files, insertions, deletions }
}

export const getAheadBehindCount = async (path: string, branch?: string): Promise<IDiffCommitCount> => {
    // https://git-scm.com/docs/git-rev-list#Documentation/git-rev-list.txt---count
    try {
        const resp = await cmd(`git -C ${path} rev-list --count --left-right ${branch || 'HEAD'}...@{upstream}`)
        const matches = resp.match(/(\d*)\s*(\d*)/)
        const [_, ahead, behind] = matches || []
        return {
            ahead: Number(ahead),
            behind: Number(behind)
        }
    } catch (error) {
        // fatal: no upstream configured for branch 'feature'
        return {ahead: null, behind: null}
    }
}

export const getRemoteDefaultBranchName = async (path: string): Promise<string> => {
    // https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---abbrev-refstrictloose
    try {
        const resp = await cmd(`git -C ${path} rev-parse --abbrev-ref origin/HEAD`)
        const branch = trimWhitespace(resp).replace('origin/', '')
        return branch
    } catch (error) {
        return ""
    }
}

export const getLocalDefaultBranchName = async (path: string): Promise<string> => {
    // https://git-scm.com/docs/git-config#Documentation/git-config.txt-initdefaultBranch
    try {
        const resp = await cmd(`git -C ${path} config --get init.defaultBranch`)
        const branch = trimWhitespace(resp)
        return branch
    } catch (error) {
        return ""
    }
}


export const isGitDirectory = async (path: string): Promise<boolean> => {
    try {
        // https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---is-inside-work-tree
        const resp = await cmd(`git -C ${path} rev-parse --is-inside-work-tree`)
        return trimWhitespace(resp) == 'true'
    } catch (error) {
        return false;
    }
}


export const getGitDirectories = async (path: string): Promise<string[]> => {
    if (await isGitDirectory(path)) return [path];
    const dirs = await getDirectories(path);
    const gitDirs = await filterAsync(dirs, isGitDirectory)
    return gitDirs
}

export const getGitStatusInfo = async (path: string): Promise<IGitStatus> => {
    const name = getDirectoryName(path);

    const [branch, statusInfo, diffCommitCount, modifiedCount] = await Promise.all([
        getCurrentBranch(path),
        getGitShortStatus(path),
        getAheadBehindCount(path),
        getModifiedCounts(path)
    ])

    const { status, tooManyChanges } = statusInfo
    const isDirty = Boolean(modifiedCount.files)
    const hasUnmergedCommits = Boolean(diffCommitCount.ahead)
    const hasUnsyncedCommits = Boolean(diffCommitCount.ahead || diffCommitCount.behind)
    const hasUnsavedChanges = isDirty || hasUnmergedCommits

    return {
        name,
        path,
        status,
        branch,
        diffCommitCount,
        modifiedCount,
        isDirty,
        hasUnsavedChanges,
        tooManyChanges: tooManyChanges || status.length > 1_000,
        hasUnmergedCommits: hasUnmergedCommits,
        hasUnsyncedCommits: hasUnsyncedCommits
    }
}

---
name: GitHub connector push
description: Publishing a local repository to an empty GitHub repository through the authenticated connector.
---

When a GitHub repository is empty, its Git Data API blob and tree endpoints return a 409 until the repository has a first commit. Bootstrap with a real tracked file through the Contents API, then create the complete tree and commit through the Git Data API and update the branch ref.

**Why:** The authenticated GitHub connection does not necessarily configure credentials for the local `git push` command, and GitHub rejects blob creation against an empty repository.

**How to apply:** Check the remote branch first. If the repository is empty, create the initial file commit, then publish the full local tree as the next commit and verify the branch head through the GitHub API.
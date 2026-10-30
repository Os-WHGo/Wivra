package com.oswhgo.wivra;

/** Pure validation of native Director receipts. No Android APIs or file access. */
public final class WivraDirectorProjectGuard {
    private WivraDirectorProjectGuard() {}

    public static boolean mayComplete(
            String launchedProjectId, String currentProjectId,
            String launchedShotId, String savedShotId) {
        return validProjectId(launchedProjectId)
            && launchedProjectId.equals(currentProjectId)
            && validShotId(launchedShotId)
            && launchedShotId.equals(savedShotId);
    }

    private static boolean validProjectId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{1,128}");
    }

    private static boolean validShotId(String id) {
        if (id == null || id.length() < 1 || id.length() > 120) return false;
        for (int i = 0; i < id.length(); i++) {
            char ch = id.charAt(i);
            if (ch < 32 || ch == 127) return false;
        }
        return true;
    }
}

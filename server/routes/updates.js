/**
 * Updates Route — Self-update system
 * Version checking, notifications, one-click updates
 */

const express = require('express');
const router = express.Router();
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

const APP_ROOT = path.join(__dirname, '..', '..'); // git root (parent of server/)
const SERVER_DIR = path.join(__dirname, '..');
const SETTINGS_FILE = path.join(SERVER_DIR, 'update-settings.json');
const pkg = require('../package.json');

let lastCheckTime = null;
let lastCheckResult = null;
let updateInterval = null;

// Detect if running inside Docker
const IS_DOCKER = fs.existsSync('/.dockerenv') || (() => {
  try { return fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'); } catch { return false; }
})();

// Detect if git is available
const HAS_GIT = (() => {
  if (IS_DOCKER) return false;
  try { execSync('git --version', { timeout: 5000, stdio: 'pipe' }); return true; } catch { return false; }
})();

// ============ Helpers ============

function getDefaultSettings() {
  return {
    autoUpdate: false,
    channel: process.env.APP_ENV || 'production',
    checkInterval: 24 // hours
  };
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...getDefaultSettings(), ...JSON.parse(raw) };
    }
  } catch (e) {
    logger.warn('Failed to load update settings:', e.message);
  }
  return getDefaultSettings();
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    logger.error('Failed to save update settings:', e.message);
    throw e;
  }
}

function getGitCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: APP_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return 'unknown';
  }
}

function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { cwd: APP_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return 'unknown';
  }
}

function semverCompare(a, b) {
  // Compare two semver strings, returns >0 if a>b, <0 if a<b, 0 if equal
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function fetchLatestVersions() {
  let latestMain = null;
  let latestBeta = null;

  // Fetch latest release (main/stable)
  try {
    const releaseRes = await fetch(
      'https://api.github.com/repos/kiliansitel/portfolio-tracker-pro/releases/latest',
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PortfolioTrackerPro'
        }
      }
    );
    if (releaseRes.ok) {
      const release = await releaseRes.json();
      latestMain = release.tag_name; // e.g. "v0.19.0"
    }
  } catch (e) {
    logger.warn('Failed to fetch latest release:', e.message);
  }

  // Fetch tags to find latest beta tag
  try {
    const tagsRes = await fetch(
      'https://api.github.com/repos/kiliansitel/portfolio-tracker-pro/git/refs/tags',
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PortfolioTrackerPro'
        }
      }
    );
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      if (Array.isArray(tags)) {
        // Find latest beta tag (e.g., v0.19.1-beta, v0.20.0-beta.1)
        const betaTags = tags
          .map(t => t.ref.replace('refs/tags/', ''))
          .filter(t => t.includes('beta'))
          .sort((a, b) => semverCompare(b, a));
        
        if (betaTags.length > 0) {
          latestBeta = betaTags[0];
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to fetch tags:', e.message);
  }

  // If no beta tag found, check latest commit on beta branch
  if (!latestBeta) {
    try {
      const branchRes = await fetch(
        'https://api.github.com/repos/kiliansitel/portfolio-tracker-pro/branches/beta',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PortfolioTrackerPro'
          }
        }
      );
      if (branchRes.ok) {
        const branch = await branchRes.json();
        latestBeta = `beta@${branch.commit.sha.substring(0, 7)}`;
      }
    } catch (e) {
      logger.warn('Failed to fetch beta branch:', e.message);
    }
  }

  // If no release found, fall back to latest tag
  if (!latestMain) {
    try {
      const tagsRes = await fetch(
        'https://api.github.com/repos/kiliansitel/portfolio-tracker-pro/tags?per_page=5',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PortfolioTrackerPro'
          }
        }
      );
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        const stableTags = tags
          .map(t => t.name)
          .filter(t => !t.includes('beta') && !t.includes('alpha') && !t.includes('rc'));
        if (stableTags.length > 0) {
          latestMain = stableTags[0];
        }
      }
    } catch (e) {
      logger.warn('Failed to fetch tags fallback:', e.message);
    }
  }

  return { latestMain, latestBeta };
}

// ============ Routes ============

/**
 * GET /check — Check for updates
 */
router.get('/check', async (req, res) => {
  try {
    const currentVersion = `v${pkg.version}`;
    const settings = loadSettings();
    const channel = settings.channel;
    
    const { latestMain, latestBeta } = await fetchLatestVersions();
    
    let updateAvailable = false;
    if (channel === 'beta' && latestBeta && !latestBeta.startsWith('beta@')) {
      updateAvailable = semverCompare(latestBeta, currentVersion) > 0;
    } else if (channel !== 'beta' && latestMain) {
      updateAvailable = semverCompare(latestMain, currentVersion) > 0;
    }

    // Also check if there are new commits on current branch (git installs only)
    let commitsAhead = 0;
    if (HAS_GIT) {
      try {
        execSync('git fetch origin --quiet', { cwd: APP_ROOT, timeout: 15000 });
        const branch = getCurrentBranch();
        const ahead = execSync(
          `git rev-list HEAD..origin/${branch} --count`,
          { cwd: APP_ROOT, encoding: 'utf8' }
        ).trim();
        commitsAhead = parseInt(ahead, 10) || 0;
        if (commitsAhead > 0) updateAvailable = true;
      } catch (e) {
        logger.warn('Failed to check commits ahead:', e.message);
      }
    }

    lastCheckTime = new Date().toISOString();
    lastCheckResult = {
      currentVersion,
      latestMain: latestMain || currentVersion,
      latestBeta: latestBeta || currentVersion,
      updateAvailable,
      commitsAhead,
      channel,
      checkedAt: lastCheckTime,
      isDocker: IS_DOCKER,
    };

    res.json(lastCheckResult);
  } catch (error) {
    logger.error('Update check failed:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

/**
 * GET /status — Current app status
 */
router.get('/status', (req, res) => {
  const settings = loadSettings();
  res.json({
    currentVersion: `v${pkg.version}`,
    branch: HAS_GIT ? getCurrentBranch() : 'unknown',
    channel: settings.channel,
    commitHash: HAS_GIT ? getGitCommitHash() : 'unknown',
    lastCheckTime: lastCheckTime || null,
    lastCheckResult: lastCheckResult || null,
    settings
  });
});

/**
 * POST /apply — Apply update
 */
router.post('/apply', async (req, res) => {
  const { channel } = req.body || {};
  const targetBranch = channel === 'main' ? 'main' : channel === 'beta' ? 'beta' : null;

  if (!targetBranch) {
    return res.status(400).json({ error: 'Invalid channel. Use "main" or "beta".' });
  }

  // Docker users can't git pull — tell them how to update
  if (IS_DOCKER || !HAS_GIT) {
    return res.status(400).json({
      error: 'Docker installation detected',
      isDocker: true,
      message: 'To update, pull the latest Docker image and recreate the container:',
      instructions: [
        'docker pull kiliansitel/portfolio-tracker-pro:latest',
        'docker stop <container>',
        'docker rm <container>',
        'docker run -d -e JWT_SECRET=<your-secret> -v portfolio-data:/app/data -p 8080:8080 kiliansitel/portfolio-tracker-pro:latest'
      ]
    });
  }

  logger.info(`Update requested: switching to ${targetBranch} by user ${req.user?.username || 'unknown'}`);

  try {
    // Run git operations synchronously for predictability
    const gitOutput = [];
    
    const fetchOut = execSync('git fetch origin', { cwd: APP_ROOT, encoding: 'utf8', timeout: 30000 });
    gitOutput.push(`fetch: ${fetchOut || 'ok'}`);

    const checkoutOut = execSync(`git checkout ${targetBranch}`, { cwd: APP_ROOT, encoding: 'utf8', timeout: 10000 });
    gitOutput.push(`checkout: ${checkoutOut || 'ok'}`);

    const pullOut = execSync(`git pull origin ${targetBranch}`, { cwd: APP_ROOT, encoding: 'utf8', timeout: 60000 });
    gitOutput.push(`pull: ${pullOut || 'ok'}`);

    const npmOut = execSync('npm ci --omit=dev', { cwd: SERVER_DIR, encoding: 'utf8', timeout: 120000 });
    gitOutput.push(`npm ci: done`);

    logger.info('Update applied successfully, restarting...', { gitOutput });

    // Send response before exiting
    res.json({
      success: true,
      message: 'Update applied. Restarting service...',
      details: gitOutput
    });

    // Give the response time to flush, then exit (systemd restarts us)
    setTimeout(() => {
      logger.info('Exiting for restart after update');
      process.exit(0);
    }, 1500);

  } catch (error) {
    logger.error('Update failed:', error);
    res.status(500).json({
      error: 'Update failed',
      details: error.message,
      stderr: error.stderr?.toString() || ''
    });
  }
});

/**
 * POST /settings — Update settings
 */
router.post('/settings', (req, res) => {
  try {
    const current = loadSettings();
    const { autoUpdate, channel, checkInterval } = req.body || {};

    if (autoUpdate !== undefined) current.autoUpdate = !!autoUpdate;
    if (channel && ['main', 'beta'].includes(channel)) current.channel = channel;
    if (checkInterval && typeof checkInterval === 'number' && checkInterval >= 1 && checkInterval <= 168) {
      current.checkInterval = checkInterval;
    }

    saveSettings(current);
    
    // Restart background checker with new settings
    startBackgroundChecker(current);

    logger.info('Update settings changed:', current);
    res.json({ success: true, settings: current });
  } catch (error) {
    logger.error('Failed to save update settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ============ Background Update Checker ============

async function checkAndAutoUpdate() {
  const settings = loadSettings();
  logger.info('Background update check running...');

  try {
    const currentVersion = `v${pkg.version}`;
    const { latestMain, latestBeta } = await fetchLatestVersions();

    let updateAvailable = false;
    const channel = settings.channel;

    // Check commits ahead (git installs only)
    let commitsAhead = 0;
    if (HAS_GIT) {
      try {
        execSync('git fetch origin --quiet', { cwd: APP_ROOT, timeout: 15000 });
        const branch = getCurrentBranch();
        const ahead = execSync(
          `git rev-list HEAD..origin/${branch} --count`,
          { cwd: APP_ROOT, encoding: 'utf8' }
        ).trim();
        commitsAhead = parseInt(ahead, 10) || 0;
        if (commitsAhead > 0) updateAvailable = true;
      } catch (e) {
        logger.warn('Background check - failed to check commits:', e.message);
      }
    }

    if (channel === 'beta' && latestBeta && !latestBeta.startsWith('beta@')) {
      if (semverCompare(latestBeta, currentVersion) > 0) updateAvailable = true;
    } else if (channel !== 'beta' && latestMain) {
      if (semverCompare(latestMain, currentVersion) > 0) updateAvailable = true;
    }

    lastCheckTime = new Date().toISOString();
    lastCheckResult = {
      currentVersion,
      latestMain: latestMain || currentVersion,
      latestBeta: latestBeta || currentVersion,
      updateAvailable,
      commitsAhead,
      channel,
      checkedAt: lastCheckTime
    };

    if (updateAvailable && settings.autoUpdate && HAS_GIT && !IS_DOCKER) {
      logger.info(`Auto-update: applying update on ${channel} channel (${commitsAhead} commits ahead)`);
      try {
        const branch = channel === 'beta' ? 'beta' : 'main';
        execSync('git fetch origin', { cwd: APP_ROOT, timeout: 30000 });
        execSync(`git checkout ${branch}`, { cwd: APP_ROOT, timeout: 10000 });
        execSync(`git pull origin ${branch}`, { cwd: APP_ROOT, timeout: 60000 });
        execSync('npm ci --omit=dev', { cwd: SERVER_DIR, timeout: 120000 });
        logger.info('Auto-update applied, restarting...');
        setTimeout(() => process.exit(0), 1000);
      } catch (e) {
        logger.error('Auto-update failed:', e.message);
      }
    } else if (updateAvailable) {
      logger.info(`Update available (${commitsAhead} commits ahead) but auto-update is disabled`);
    } else {
      logger.info('No updates available');
    }
  } catch (error) {
    logger.error('Background update check failed:', error);
  }
}

function startBackgroundChecker(settings) {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  if (!settings) settings = loadSettings();

  if (settings.autoUpdate || settings.checkInterval) {
    const intervalMs = (settings.checkInterval || 24) * 60 * 60 * 1000;
    logger.info(`Background update checker started (every ${settings.checkInterval || 24}h)`);
    updateInterval = setInterval(checkAndAutoUpdate, intervalMs);
  }
}

// Initialize background checker on module load
function initUpdateChecker() {
  const settings = loadSettings();
  if (settings.autoUpdate) {
    // Initial check after 60 seconds (let the app start up)
    setTimeout(checkAndAutoUpdate, 60000);
  }
  startBackgroundChecker(settings);
}

// Start the checker
initUpdateChecker();

module.exports = router;

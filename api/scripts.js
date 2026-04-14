// api/scripts.js — Vercel serverless function
// Returns list of .txt files in the /public/scripts/ directory
// Deploy to: /api/scripts.js in your Vercel project root

const fs = require('fs');
const path = require('path');

module.exports = function(req, res) {
  try {
    var scriptsDir = path.join(process.cwd(), 'public', 'scripts');
    
    // Fallback path if scripts are not under /public
    if (!fs.existsSync(scriptsDir)) {
      scriptsDir = path.join(process.cwd(), 'scripts');
    }

    var files = fs.existsSync(scriptsDir)
      ? fs.readdirSync(scriptsDir).filter(function(f) { return f.endsWith('.txt'); })
      : [];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(files);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
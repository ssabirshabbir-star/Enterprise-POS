/**
 * index.js — Lucky Draw V2 Module Entry Point
 *
 * File:      src/main/features/luckydraw_v2/index.js
 * Risk:      ZERO — exports only, nothing runs until registerLuckyDrawV2Routes is called
 * Rollback:  Do not require this file from main.js
 *
 * Integration (manual, when ready):
 *   In main.js:
 *     const { registerLuckyDrawV2Routes } = require('./features/luckydraw_v2');
 *     registerLuckyDrawV2Routes(ipcMain);
 */
'use strict';

const { registerLuckyDrawV2Routes } = require('./controller/luckydraw.controller');

module.exports = { registerLuckyDrawV2Routes };

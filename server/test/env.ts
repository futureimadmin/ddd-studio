// Imported first by every test so it runs before src/config.ts reads the environment.
// (Assignments placed after `import` statements would run too late: ESM hoists imports.)
process.env.DDD_AI_OFFLINE = "1";

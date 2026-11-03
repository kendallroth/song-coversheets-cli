import chalk from "chalk";
import { Command } from "commander";

import { generateCommand } from "#commands/generate/generate.command";

const cli = new Command();
cli.name("songsheets").description("Songsheet utilities").addCommand(generateCommand);

// Handle user exiting Inquirer prompts gracefully (may not be needed if actions catch these errors!)
process.on("uncaughtException", (error) => {
  if (error instanceof Error && error.name === "ExitPromptError") {
    console.log(chalk.red("Operation cancelled"));
  } else {
    throw error;
  }
});

await cli.parseAsync(process.argv);

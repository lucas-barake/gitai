import { execSync } from "child_process";
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function getLatestTag() {
  try {
    const tag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch {
    return "0.0.0";
  }
}

function bumpVersion(version: string, type: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

async function main() {
  try {
    const currentVersion = getLatestTag();
    console.log(`Current version: ${currentVersion}`);

    const bumpType = await question("Version bump (major/minor/patch): ");

    if (!["major", "minor", "patch"].includes(bumpType)) {
      console.log("Invalid bump type. Must be major, minor, or patch.");
      process.exit(1);
    }

    const newVersion = bumpVersion(currentVersion, bumpType as "major" | "minor" | "patch");
    console.log(`New version will be: ${newVersion}`);

    const confirm = await question("Continue? (y/N): ");
    if (confirm.toLowerCase() !== "y") {
      console.log("Cancelled.");
      process.exit(0);
    }

    const tag = `v${newVersion}`;
    execSync(`git tag ${tag}`, { stdio: "inherit" });
    execSync(`git push origin ${tag}`, { stdio: "inherit" });
    console.log(`✅ Created and pushed tag ${tag}`);

    console.log("\n🚀 Release workflow triggered! Check GitHub Actions for progress.");
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parse } from "yaml";

/**
 * リポジトリの設定を保存
 */
export async function saveRepositoryConfig(
  repositoryId: string,
  yamlContent: string
) {
  try {
    // YAMLをパースして検証
    let configJson = null;
    if (yamlContent.trim()) {
      try {
        configJson = parse(yamlContent);
      } catch (parseError) {
        return {
          success: false,
          error:
            parseError instanceof Error
              ? parseError.message
              : "Invalid YAML format",
        };
      }
    }

    // リポジトリの存在確認
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return { success: false, error: "Repository not found" };
    }

    // 設定を更新
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { config: configJson },
    });

    revalidatePath(`/dashboard/repositories/${repositoryId}/settings`);
    revalidatePath("/dashboard/repositories");

    return { success: true };
  } catch (error) {
    console.error("Failed to save repository config:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save config",
    };
  }
}

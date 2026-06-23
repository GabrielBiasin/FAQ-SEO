"use client";

import TopicsTab from "./TopicsTab";
import SectionsSection from "./SectionsSection";
import SeedsSection from "./SeedsSection";
import QuestionsSection from "./QuestionsSection";

/**
 * Combined "Tópicos & Preguntas" tab:
 *  - Topic analysis (summary + clusters)
 *  - Site sections (detected, configurable, coverage targets + expand)
 *  - Seed questions loader (real sales/support questions)
 *  - Discovered & editable question set, grouped by section/topic
 */
export default function TopicsQuestionsTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-8">
      <TopicsTab projectId={projectId} />
      <SectionsSection projectId={projectId} />
      <SeedsSection projectId={projectId} />
      <QuestionsSection projectId={projectId} />
    </div>
  );
}

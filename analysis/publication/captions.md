# Figures and tables

Generated from the existing CSV selection without modifying the inputs.

## fig1_code_non_code_churn

Weekly combined churn split into code and non-code. Non-code includes Markdown, configuration and other included text; blanks and comments are counted. Churn measures changes, not current codebase size or productivity.

Sources: `weekly.csv`.

Files: [figures/fig1_code_non_code_churn.png](figures/fig1_code_non_code_churn.png), [figures/fig1_code_non_code_churn.pdf](figures/fig1_code_non_code_churn.pdf), [figures/fig1_code_non_code_churn.svg](figures/fig1_code_non_code_churn.svg)

## fig2_application_churn

Weekly churn by path-based application scope on a common date axis. Zeroes include weeks before an application's first recorded change. Scope churn sums to combined churn; commit counts can overlap.

Sources: `backend/commits.csv`, `next/commits.csv`, `shared/commits.csv`, `legacy_frontend/commits.csv`.

Files: [figures/fig2_application_churn.png](figures/fig2_application_churn.png), [figures/fig2_application_churn.pdf](figures/fig2_application_churn.pdf), [figures/fig2_application_churn.svg](figures/fig2_application_churn.svg)

## fig3_ai_task_categories

AI-log entries by automatically assigned task category. Categories are keyword heuristics and should be spot-checked against original requests. Entries are not necessarily unique tasks or AI conversations.

Sources: `ai_log.csv`.

Files: [figures/fig3_ai_task_categories.png](figures/fig3_ai_task_categories.png), [figures/fig3_ai_task_categories.pdf](figures/fig3_ai_task_categories.pdf), [figures/fig3_ai_task_categories.svg](figures/fig3_ai_task_categories.svg)

## fig4_document_text_size

Estimated current document text size by category, including local ignored Markdown. Token estimates use ceil(characters / 4) per file. They are not actual model tokens, loaded context, API usage or costs, and are not historical snapshots.

Sources: `documents.csv`.

Files: [figures/fig4_document_text_size.png](figures/fig4_document_text_size.png), [figures/fig4_document_text_size.pdf](figures/fig4_document_text_size.pdf), [figures/fig4_document_text_size.svg](figures/fig4_document_text_size.svg)

## fig5_recorded_activity

Weekly recorded session notes and AI-log entries, shown separately. Records may describe the same work and must not be summed as unique tasks. Activity is based on note dates, not historical file modifications or AI calls.

Sources: `document_weekly.csv`.

Files: [figures/fig5_recorded_activity.png](figures/fig5_recorded_activity.png), [figures/fig5_recorded_activity.pdf](figures/fig5_recorded_activity.pdf), [figures/fig5_recorded_activity.svg](figures/fig5_recorded_activity.svg)

## fig6_review_workflow

Illustrative evidence-review workflow, not an automatically inferred sequence or a causal result. A case study must link dated plan/request, AI-assisted work, human review and verification records before claiming this sequence occurred. No counts are assigned to the arrows.

Sources: `plan_items.csv`, `dated_notes.csv`.

Files: [figures/fig6_review_workflow.png](figures/fig6_review_workflow.png), [figures/fig6_review_workflow.pdf](figures/fig6_review_workflow.pdf), [figures/fig6_review_workflow.svg](figures/fig6_review_workflow.svg)

## table1_dataset

Dataset summary for the exported selection. Authors are pseudonyms, not verified unique people. Log counts can overlap. Zero AI-tagged commits does not establish absence of AI use.

Sources: `commits.csv`, `weekly.csv`, `ai_log.csv`, `document_weekly.csv`.

Files: [tables/table1_dataset.png](tables/table1_dataset.png), [tables/table1_dataset.pdf](tables/table1_dataset.pdf), [tables/table1_dataset.svg](tables/table1_dataset.svg)

## table2_applications

Application comparison. File paths assign scope. Cross-scope commits/authors overlap and must not be summed; churn partitions the combined total. Shared documents may concern both applications.

Sources: `commits.csv`, `ai_log.csv`, `backend/commits.csv`, `next/commits.csv`, `shared/commits.csv`, `legacy_frontend/commits.csv`.

Files: [tables/table2_applications.png](tables/table2_applications.png), [tables/table2_applications.pdf](tables/table2_applications.pdf), [tables/table2_applications.svg](tables/table2_applications.svg)

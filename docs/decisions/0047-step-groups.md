# Step groups

- Status: accepted
- Date: 2026-10-30

## Context

A reply that does a lot of work shows a long column of steps, one box for each thought and each call to a tool. In the first evaluation, the maintainer asked for a way to merge them, so the steps do not drown the text of the reply.

## Decision

- The steps and thoughts between two texts form a step group, once there are two of them and at least one is a step. A single step or a thought alone stays a box of its own.
- A step group is a step box whose body holds its steps, so it opens, folds, and follows like any step.
- While its last step is under way, the group stays open and shows its latest steps. Once the work moves on, it folds into one line that counts its steps, unless the user opens or closes it.
- A group counts only its steps, because a thought is the model reasoning and not an action.
- Each step inside a group keeps its own state, so opening the group shows its steps folded.

## Consequences

- A run that starts with one step becomes a group when the second step arrives, so the first step moves into the group.
- The styles of a step box reach only its own body and its own view, never the boxes inside it.

---
layout: page
title: Research & Projects
permalink: /research-projects/
---


## Towards Machine Learning for Network Optimization — Buffer Sizing via Reinforcement Learning

*Princeton ECE Senior Thesis — 2023 · G. David Forney Jr. Thesis Prize*

I completed my undergraduate thesis in the ECE Department, under the guidance of
Professor Maria Apostolaki in the NetSyn Lab at Princeton. We present a
reinforcement learning algorithm to select optimal buffer thresholds, with the
aim of developing a buffer management strategy which more dynamically responds to
changes in network traffic. We use NS–3 (Network Simulator 3) to simulate
different network configurations with varying traffic loads, TCP protocols, and
per-priority queue weights on a fixed topology, and compare our reinforcement
learning algorithm (RLBM) to a statically-configured buffer management scheme
(SB). Within a limited topological scope, simulation results indicate that RLBM
produces the same or better throughput as SB in simulations with larger physical
buffers. The RLBM scheme also showed significant improvement in the worst
observed FCT slowdown and end-to-end delay for small buffer sizes. Our findings
indicate that reinforcement learning algorithms could improve network performance
over traditional buffer management schemes, and warrant further exploration of
reinforcement learning solutions to the buffer management problem.

[Read the thesis (PDF)]({{ '/files/veizi-thesis.pdf' | relative_url }})

&nbsp;
&nbsp;

---

## Other Projects

### Person-Fit Statistics for Sandbagging Detection
*Stanford CS321M — Spring 2026*&nbsp;&nbsp;
Can a tool from educational testing catch a language model that is deliberately
underperforming? Person-fit statistics flag test-takers whose pattern of right and
wrong answers doesn't match their overall ability; I applied them to models answering
hazardous-knowledge benchmark questions.
[Code](https://github.com/artemisveizi/sandbagging)

### Person-Fit Statistics for Benchmark Contamination
*Extension — Summer 2026*&nbsp;&nbsp;
The mirror question: can the same statistics flag a model that has memorized a
benchmark's test questions, using only which questions it got right?

### Cold-Start Predictive Evaluation on AI Benchmarks
*Stanford CS321M — 2026*&nbsp;&nbsp;
Predicting model performance on AI benchmarks under cold-start conditions, where
little or no prior evaluation data is available.
[Code](https://github.com/artemisveizi/cs321m-prediction-project)

### Bayesian Marathon Time Prediction
*Stanford CS109 — 2026*&nbsp;&nbsp;
A Bayesian approach to predicting marathon finishing times from training and race
data. Some would say...better than Strava?
[Code](https://github.com/artemisveizi/bayesian-marathon)

&nbsp;
&nbsp;

---

## Just for fun...

- **[8-Puzzle Solver](https://github.com/artemisveizi/8puzzle-AI)** — Uses breadth-first search to solve 8 puzzles in the smallest number of moves possible.
- **[N-Queens Solver](https://github.com/artemisveizi/nqueens-AI)** — The classic eight queens puzzle, extended to n queens: placing n queens on an n x n chessboard such that no two queens threaten each other.
- **[Word Ladder Solver](https://github.com/artemisveizi/wordladder-AI)** — Uses the Informed A* Search algorithm to find the shortest Levenshtein distance between two words in a given dictionary of valid words.
- **[Othello Player](https://github.com/artemisveizi/othello-AI)** — Plays Othello (and will almost certainly beat all humans). Implements alpha-beta pruning to search the solution tree efficiently.

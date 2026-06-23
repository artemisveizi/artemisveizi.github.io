---
layout: page
title: Research & Projects
permalink: /research-projects/
---

## <a name="sandbagging"></a>Person-Fit Statistics as a Black-Box Detector for LLM Sandbagging on Hazardous-Capability Benchmarks

*Stanford CS321M (AI Measurement Science) — Spring 2026*

Sandbagging is a class of deceptive behavior in which LLMs deliberately
underperform on an evaluation. This is a central concern in pre-deployment
testing for frontier models (van der Weij et al., 2024; Greenblatt et al.,
2024), as misaligned models may underperform selectively on items or benchmarks
intended to test for hazardous behavior, preventing model developers from
adequately mitigating these behaviors. Published sandbagging detectors largely
require access to model internals, like hidden-state activations (Boxo et al.,
2025) or weight-level perturbation (Tice et al., 2024); this level of access is
not available to third-party evaluators of closed-weight models, motivating the
need for black-box detection methods. We treat sandbagging as a classical
psychometric *person-fit* problem and ask whether ℓ\*z, H^T, and U3 detect three
different sandbagging conditions on the WMDP benchmark (bio, cyber, chem):
uniform prompted sandbagging, selective-target prompted sandbagging, and UK
AISI's fine-tuned Model Organisms with a deployment-context trigger. Across N =
17 open-weight 3–9B baseline models, uniform prompted sandbagging is detected at
near-ceiling (AUROC = 0.92–0.99); leave-one-model-out (LOMO) detection of the
AISI fine-tuned MOs reaches AUROC = 0.97 on cyber, 0.91 on chem (p = 0.004), and
0.88 on bio (p = 0.009). We show that person-fit statistics retain discriminative
power above accuracy alone (ΔAUROC = +0.06 to +0.12); however, the same
statistics flag two non-sandbagging baseline models (DeepSeek-7B,
Qwen2.5-7B-Instruct) as |z| > 3 outliers under normal conditions, attributable to
a pretrained letter bias and an inference-pipeline artifact, respectively.
Person-fit statistics detect *aberrance*; sandbagging is one of several possible
mechanisms that produce aberrant response patterns. We argue for the method as a
triage and flagging tool, not a standalone classifier, and supply a reproducible
torch\_measure-based pipeline.

[Paper (PDF)]({{ '/aveizi_CS321M_Final_Project.pdf' | relative_url }})
&nbsp;·&nbsp;
[Code](https://github.com/artemisveizi/sandbagging)

&nbsp;
&nbsp;

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

[Read the thesis (PDF)]({{ '/Veizi_Artemis_Thesis.pdf' | relative_url }})

&nbsp;
&nbsp;

---

## Other Projects

### Cold-Start Predictive Evaluation on AI Benchmarks
*Stanford CS321M — 2026*
Predicting model performance on AI benchmarks under cold-start conditions, where
little or no prior evaluation data is available.
[Code](https://github.com/artemisveizi/cs321m-prediction-project)

### Bayesian Marathon Time Prediction
*Stanford CS109 — 2026*
A Bayesian approach to predicting marathon finishing times from training and race
data.
[Code](https://github.com/artemisveizi/bayesian-marathon)

&nbsp;
&nbsp;

---

## Just for fun...

- **[8-Puzzle Solver](https://github.com/artemisveizi/8puzzle-AI)** — Uses breadth-first search to solve 8 puzzles in the smallest number of moves possible.
- **[N-Queens Solver](https://github.com/artemisveizi/nqueens-AI)** — The classic eight queens puzzle, extended to n queens: placing n queens on an n x n chessboard such that no two queens threaten each other.
- **[Word Ladder Solver](https://github.com/artemisveizi/wordladder-AI)** — Uses the Informed A* Search algorithm to find the shortest Levenshtein distance between two words in a given dictionary of valid words.
- **[Othello Player](https://github.com/artemisveizi/othello-AI)** — Plays Othello (and will almost certainly beat all humans). Implements alpha-beta pruning to search the solution tree efficiently.

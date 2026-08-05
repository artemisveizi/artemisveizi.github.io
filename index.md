---
layout: home
---

<div class="intro">

<div class="intro-text" markdown="1">

## Hi! I'm Artemis.

I'm an M.S. student in Computer Science (Artificial Intelligence) at Stanford University, and an engineer in Apple's Silicon Engineering Group. Previously, I earned my B.S.E. in Electrical and Computer Engineering (Computer Systems) from Princeton University. My work and research focus on quantitative methods for understanding and evaluating large-scale systems.

</div>

<figure class="intro-photo">
  <picture>
    <source srcset="{{ '/assets/img/artemis-thesis.webp' | relative_url }}" type="image/webp">
    <img src="{{ '/assets/img/artemis-thesis.jpg' | relative_url }}"
         width="1600" height="2064" decoding="async"
         alt="Artemis Veizi holding her bound Princeton senior thesis, &ldquo;Towards Machine Learning for Network Optimization: Buffer Sizing via Reinforcement Learning&rdquo;, beside the Princeton tiger statue.">
  </picture>
</figure>

</div>

<script src="{{ '/assets/js/intro-photo.js' | relative_url }}" defer></script>

&nbsp;
&nbsp;

## Featured Work

<div class="featured-card" markdown="1">

### Language Model Benchmark Contamination Leaves a Person-Fit Signature

*Under review — AAAI-27*

A benchmark score is trustworthy only if the evaluated model has not trained on the
test items, yet existing contamination detectors demand privileged access — model
weights, token log-probabilities, or the training corpus — that a public leaderboard
entry does not expose. We propose a detector requiring only the *graded response
matrix*: which items each model answered correctly. Treating contamination as
psychometric *item preknowledge*, a contaminated model behaves like an aberrant
test-taker, succeeding on items too difficult for its true ability because it has
memorized them.

[Take a look &rarr;]({{ '/research-projects/#contamination' | relative_url }})
&nbsp;·&nbsp;
[Paper (PDF)]({{ '/veizi_contamination_person_fit.pdf' | relative_url }})
&nbsp;·&nbsp;
[Code](https://github.com/artemisveizi/contamination-person-fit)

</div>

&nbsp;
&nbsp;

See my [research &amp; projects]({{ '/research-projects/' | relative_url }}) or
read my [CV]({{ '/cv/' | relative_url }}). You can reach me at
`aveizi (at) stanford (dot) edu`, or find me on
[LinkedIn](https://www.linkedin.com/in/artemisveizi/) and
[GitHub](https://github.com/artemisveizi).

{% include pool-table.html %}

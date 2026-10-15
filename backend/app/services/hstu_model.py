"""Small CPU HSTU adaptation, not Meta's industrial implementation.

SiLU pointwise U/V/Q/K, unnormalised causal attention with relative position/time
bias, and multiplicative gating follow arXiv:2402.17152v3. Financial features are
late-fused; they never calculate money or edit the financial ledger.
"""
import torch
from torch import nn
from torch.nn import functional as F


class HSTUBlock(nn.Module):
    def __init__(self, dimension=48, heads=4):
        super().__init__()
        if dimension % heads:
            raise ValueError('dimension_must_be_divisible_by_heads')
        self.heads, self.width = heads, dimension // heads
        self.norm = nn.LayerNorm(dimension)
        self.uvqk = nn.Linear(dimension, dimension * 4)
        self.position_bias = nn.Embedding(65, heads)
        self.time_bias = nn.Embedding(33, heads)
        self.attention_norm = nn.LayerNorm(dimension)
        self.output = nn.Linear(dimension, dimension)

    def forward(self, sequence, timestamps, valid):
        batch, length, dimension = sequence.shape
        u, v, q, k = F.silu(self.uvqk(self.norm(sequence))).chunk(4, dim=-1)
        def heads(x):
            return x.reshape(batch, length, self.heads, self.width).transpose(1, 2)
        distance = torch.arange(length, device=sequence.device)
        distance = distance[:, None] - distance[None, :]
        relative_position = self.position_bias(distance.clamp(-32, 32) + 32).permute(2, 0, 1)
        time_difference = (timestamps[:, :, None] - timestamps[:, None, :]).abs()
        time_buckets = torch.log2(time_difference + 1).long().clamp(0, 32)
        relative_time = self.time_bias(time_buckets).permute(0, 3, 1, 2)
        scores = F.silu(torch.matmul(heads(q), heads(k).transpose(-1, -2)) / self.width**.5
                        + relative_position[None] + relative_time)
        allowed = (distance >= 0)[None, None] & valid[:, None, None, :] & valid[:, None, :, None]
        weights = scores.masked_fill(~allowed, 0)
        # Prefix length normalisation preserves causality when future tokens append.
        normalizer = allowed.sum(-1, keepdim=True).clamp_min(1)
        attended = torch.matmul(weights / normalizer, heads(v)).transpose(1, 2).reshape(batch, length, dimension)
        result = sequence + self.output(self.attention_norm(attended) * u)
        return result * valid.unsqueeze(-1)


class YouthGainHSTU(nn.Module):
    def __init__(self, feature_count, dimension=48, layers=2, heads=4, buckets=4096):
        super().__init__()
        self.config = dict(feature_count=feature_count, dimension=dimension, layers=layers, heads=heads, buckets=buckets)
        self.items = nn.Embedding(buckets, dimension, padding_idx=0)
        self.text = nn.Embedding(buckets, dimension, padding_idx=0)
        self.actions = nn.Embedding(12, dimension, padding_idx=0)
        self.start = nn.Parameter(torch.randn(dimension) * .02)
        self.blocks = nn.ModuleList([HSTUBlock(dimension, heads) for _ in range(layers)])
        self.finance = nn.Sequential(nn.Linear(feature_count * 2, dimension), nn.SiLU(), nn.LayerNorm(dimension))
        self.head = nn.Sequential(nn.Linear(dimension * 6, dimension), nn.SiLU(), nn.Linear(dimension, 2))

    def item_vectors(self, ids, text):
        mask = (text != 0).unsqueeze(-1)
        content = (self.text(text) * mask).sum(-2) / mask.sum(-2).clamp_min(1)
        # Content dominates hashed IDs, so unseen episodes can be scored without a learned ID.
        return .1 * self.items(ids) + content

    def encode_history(self, batch):
        sequence = self.item_vectors(batch['history_ids'], batch['history_text']) + self.actions(batch['actions'])
        # Always-present start token supports a real, explicit cold-start path.
        sequence = torch.cat([self.start[None, None].expand(sequence.shape[0], 1, -1), sequence], dim=1)
        valid = torch.cat([torch.ones_like(batch['valid'][:, :1]), batch['valid']], dim=1)
        times = torch.cat([batch['timestamps'][:, :1], batch['timestamps']], dim=1)
        for block in self.blocks:
            sequence = block(sequence, times, valid)
        return sequence, valid

    def forward(self, batch):
        sequence, valid = self.encode_history(batch)
        candidate = self.item_vectors(batch['candidate_ids'], batch['candidate_text'])
        target_weights = torch.matmul(candidate, sequence.transpose(1, 2)) / candidate.shape[-1]**.5
        target_weights = target_weights.masked_fill(~valid[:, None], -1e4).softmax(-1)
        target_history = torch.matmul(target_weights, sequence)
        positions = valid.sum(-1).long() - 1
        latest = sequence[torch.arange(sequence.shape[0]), positions][:, None].expand_as(candidate)
        finance = self.finance(torch.cat([batch['features'], batch['missing_mask']], -1))[:, None].expand_as(candidate)
        theme_tokens = batch['learning_topic']
        theme_mask = (theme_tokens != 0).unsqueeze(-1)
        theme = (self.text(theme_tokens) * theme_mask).sum(1) / theme_mask.sum(1).clamp_min(1)
        theme = theme[:, None].expand_as(candidate)
        interaction = candidate * (theme + target_history)
        return self.head(torch.cat([candidate, latest, target_history, finance, theme, interaction], -1))

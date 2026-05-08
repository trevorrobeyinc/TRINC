"""Per-target connectors. Each connector knows: target URL shape, parser, license,
and the provenance schema fields the openclaw-bridge dataset pipeline expects.
"""

from .base import Connector, NormalizedRecord
from .elife import ELifeConnector


REGISTRY: dict[str, Connector] = {
    ELifeConnector.target_id: ELifeConnector(),
}


__all__ = ["Connector", "NormalizedRecord", "REGISTRY"]


from app.services.reasoning_depth_router_service import ReasoningDepthRouter
from app.services.schedule2_exhaustive_discovery_service import Schedule2ExhaustiveDiscoveryService
class DummyPacket:
    latest_user_message_internal_en="An overseas worker has special skills and an employer wants short-term work. What visa to suggest?"; latest_user_message_raw=latest_user_message_internal_en; recent_dialogue_text=""
decision=ReasoningDepthRouter().classify(memory_packet=DummyPacket()); print("tier:",decision.tier); assert decision.tier=="exhaustive_discovery"
result=Schedule2ExhaustiveDiscoveryService().discover(question=DummyPacket.latest_user_message_internal_en); print("clauses scanned:",result.total_clauses_scanned); print("subclasses scanned:",result.total_subclasses_scanned); print("top candidates:",[c.subclass for c in result.candidates[:8]]); assert result.total_clauses_scanned>0; print("OK")

from app.services.v2.verified_answer_service_patch2 import QueryServiceV2Patch2

service = QueryServiceV2Patch2()
assert hasattr(service, "_repair_prompt")
assert hasattr(service, "_format_profile")
print("V2 answer format patch imports OK")

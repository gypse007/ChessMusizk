import os
import boto3
import hashlib
from pathlib import Path
from typing import Optional


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def upload_audio(key: str, file_path: str, content_type: str = "audio/opus") -> str:
    client = get_s3_client()
    bucket = os.environ["R2_BUCKET"]
    extra = {"ContentType": content_type}
    client.upload_file(file_path, bucket, key, ExtraArgs=extra)
    return f"{os.environ['R2_ENDPOINT']}/{bucket}/{key}"


def upload_json(key: str, data: dict) -> str:
    import json

    client = get_s3_client()
    bucket = os.environ["R2_BUCKET"]
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(data).encode("utf-8"),
        ContentType="application/json",
    )
    return f"{os.environ['R2_ENDPOINT']}/{bucket}/{key}"


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    client = get_s3_client()
    bucket = os.environ["R2_BUCKET"]
    return client.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
    )

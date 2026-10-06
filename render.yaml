import os
import requests
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field


app = FastAPI(title="ElevenLab", version="1.0.0")

API_BASE = "https://api.elevenlabs.io/v1"

DEFAULT_MODEL = "eleven_multilingual_v2"
DEFAULT_FORMAT = "mp3_44100_128"


def get_api_keys():
    raw = os.getenv("ELEVENLABS_API_KEYS", "")

    return [
        key.strip()
        for key in raw.split(",")
        if key.strip()
    ]


class GenerateRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=50000
    )

    voice_id: str = Field(
        min_length=1,
        max_length=200
    )

    model_id: str = DEFAULT_MODEL

    output_format: str = DEFAULT_FORMAT

    language_code: Optional[str] = "tr"

    stability: Optional[float] = None

    similarity_boost: Optional[float] = None

    style: Optional[float] = None

    speed: Optional[float] = None


def subscription(key):

    response = requests.get(
        f"{API_BASE}/user/subscription",

        headers={
            "xi-api-key": key
        },

        timeout=20
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"{response.status_code}: "
            f"{response.text[:300]}"
        )

    return response.json()


def get_status():

    result = []

    for index, key in enumerate(
        get_api_keys(),
        start=1
    ):

        try:

            data = subscription(key)

            used = int(
                data.get(
                    "character_count",
                    0
                ) or 0
            )

            limit = data.get(
                "character_limit"
            )

            remaining = None

            if limit is not None:

                remaining = max(
                    0,
                    int(limit) - used
                )

            result.append({
                "index": index,
                "ok": True,
                "tier": data.get(
                    "tier",
                    "unknown"
                ),
                "used": used,
                "limit": limit,
                "remaining": remaining
            })

        except Exception as error:

            result.append({
                "index": index,
                "ok": False,
                "error": str(error)
            })

    return result


@app.get(
    "/",
    response_class=HTMLResponse
)
def home():

    return HTMLResponse(
        INDEX_HTML
    )


@app.get("/api/status")
def status():

    keys = get_api_keys()

    return {
        "configured": bool(keys),

        "keys": (
            get_status()
            if keys
            else []
        )
    }


@app.get("/api/voices")
def voices():

    keys = get_api_keys()

    if not keys:

        raise HTTPException(
            status_code=503,
            detail=(
                "ELEVENLABS_API_KEYS "
                "ayarlanmamış."
            )
        )

    last_error = ""

    for key in keys:

        response = requests.get(
            f"{API_BASE}/voices",

            headers={
                "xi-api-key": key
            },

            timeout=30
        )

        if response.status_code == 200:

            return response.json()

        last_error = (
            f"{response.status_code}: "
            f"{response.text[:300]}"
        )

        if response.status_code not in (
            401,
            402,
            403,
            429
        ):
            break

    raise HTTPException(
        status_code=502,
        detail=(
            "Sesler alınamadı: "
            + last_error
        )
    )


@app.post("/api/generate")
def generate(
    request: GenerateRequest
):

    keys = get_api_keys()

    if not keys:

        raise HTTPException(
            status_code=503,
            detail=(
                "ELEVENLABS_API_KEYS "
                "ayarlanmamış."
            )
        )

    payload = {
        "text": request.text,
        "model_id": request.model_id
    }

    if request.language_code:

        payload["language_code"] = (
            request.language_code
        )

    voice_settings = {}

    if request.stability is not None:

        voice_settings[
            "stability"
        ] = request.stability

    if request.similarity_boost is not None:

        voice_settings[
            "similarity_boost"
        ] = request.similarity_boost

    if request.style is not None:

        voice_settings[
            "style"
        ] = request.style

    if request.speed is not None:

        voice_settings[
            "speed"
        ] = request.speed

    if voice_settings:

        payload[
            "voice_settings"
        ] = voice_settings

    errors = []

    for index, key in enumerate(
        keys,
        start=1
    ):

        try:

            response = requests.post(

                f"{API_BASE}/text-to-speech/"
                f"{request.voice_id}",

                params={
                    "output_format":
                    request.output_format
                },

                headers={
                    "xi-api-key": key,

                    "Content-Type":
                    "application/json"
                },

                json=payload,

                timeout=180
            )

            if response.status_code == 200:

                audio = Response(

                    content=response.content,

                    media_type=response.headers.get(
                        "content-type",
                        "audio/mpeg"
                    )
                )

                audio.headers[
                    "Content-Disposition"
                ] = (
                    'attachment; '
                    'filename="elevenlab.mp3"'
                )

                audio.headers[
                    "X-Eleven-Key-Index"
                ] = str(index)

                return audio

            errors.append(
                f"Key {index}: "
                f"{response.status_code}"
            )

            if response.status_code not in (
                401,
                402,
                403,
                429
            ):
                break

        except requests.RequestException as error:

            errors.append(
                f"Key {index}: {error}"
            )

    raise HTTPException(

        status_code=502,

        detail=(
            "Tüm yetkili API anahtarları "
            "başarısız oldu. "
            + " | ".join(errors)
        )
    )


INDEX_HTML = """
<!DOCTYPE html>

<html lang="tr">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
>

<title>ElevenLab</title>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    background: #090b10;

    color: #f5f5f5;

    font-family:
        Arial,
        Helvetica,
        sans-serif;
}

.container {

    width:
        min(
            1000px,
            calc(100% - 30px)
        );

    margin: auto;

    padding:
        30px 0 60px;
}

header {

    display: flex;

    justify-content:
        space-between;

    align-items:
        center;

    margin-bottom: 25px;
}

h1 {

    margin: 0;

    font-size: 30px;
}

.subtitle {

    color: #8e96a5;

    margin-top: 5px;
}

.status {

    padding:
        8px 12px;

    border:
        1px solid #303642;

    border-radius:
        999px;

    font-size: 13px;
}

.card {

    background: #11141b;

    border:
        1px solid #252a35;

    border-radius: 16px;

    padding: 20px;

    margin-bottom: 16px;
}

label {

    display: block;

    color: #aeb5c2;

    font-size: 13px;

    margin-bottom: 7px;
}

textarea,
select,
input {

    width: 100%;

    background: #090c12;

    color: white;

    border:
        1px solid #303642;

    border-radius: 10px;

    padding: 12px;

    font-size: 14px;
}

textarea {

    min-height: 330px;

    resize: vertical;
}

.grid {

    display: grid;

    grid-template-columns:
        2fr 1fr;

    gap: 12px;

    margin-top: 12px;
}

.row {

    display: grid;

    grid-template-columns:
        1fr 1fr;

    gap: 12px;

    margin-top: 12px;
}

button {

    border: none;

    border-radius: 10px;

    padding:
        13px 18px;

    background: white;

    color: black;

    font-weight: bold;

    cursor: pointer;
}

button:disabled {

    opacity: .5;

    cursor: not-allowed;
}

.actions {

    display: flex;

    align-items: center;

    gap: 12px;

    margin-top: 15px;
}

.muted {

    color: #8e96a5;
}

.success {

    color: #69e09a;
}

.error {

    color: #ff7777;
}

@media(max-width:700px) {

    .grid,
    .row {

        grid-template-columns:
            1fr;
    }

    textarea {

        min-height: 250px;
    }
}

</style>

</head>


<body>

<div class="container">

<header>

<div>

<h1>
ElevenLab
</h1>

<div class="subtitle">
Metni sese çevir · MP3 indir
</div>

</div>

<div
id="status"
class="status"
>
Kontrol ediliyor...
</div>

</header>


<div class="card">

<label>
Metin
</label>

<textarea
id="text"
placeholder="Seslendirmek istediğin metni buraya yapıştır..."
></textarea>


<div class="grid">

<div>

<label>
Ses
</label>

<select id="voice">

<option>
Sesler yükleniyor...
</option>

</select>

</div>


<div>

<label>
Model
</label>

<select id="model">

<option
value="eleven_multilingual_v2"
>
Multilingual v2
</option>

<option
value="eleven_v3"
>
Eleven v3
</option>

<option
value="eleven_flash_v2_5"
>
Flash v2.5
</option>

</select>

</div>

</div>


<div class="row">

<div>

<label>
Stability
</label>

<input
id="stability"
type="number"
min="0"
max="1"
step="0.05"
placeholder="Varsayılan"
/>

</div>


<div>

<label>
Similarity Boost
</label>

<input
id="similarity"
type="number"
min="0"
max="1"
step="0.05"
placeholder="Varsayılan"
/>

</div>

</div>


<div class="actions">

<button id="generate">

🎙️ Sesi Üret ve İndir

</button>

<span
id="message"
class="muted"
></span>

</div>

</div>


<div class="card">

<strong>
API Durumu
</strong>

<div
id="keys"
class="muted"
style="margin-top:10px"
>
Yükleniyor...
</div>

</div>

</div>


<script>

const $ = id =>
    document.getElementById(id);


async function loadStatus() {

    try {

        const response =
            await fetch(
                "/api/status"
            );

        const data =
            await response.json();

        const status =
            $("status");


        if (data.configured) {

            status.textContent =
                "API hazır";

            status.className =
                "status success";

        } else {

            status.textContent =
                "API anahtarı yok";

            status.className =
                "status error";
        }


        if (!data.configured) {

            $("keys").textContent =
                "API anahtarı ayarlanmamış.";

            return;
        }


        $("keys").innerHTML =
            data.keys
                .map(key => {

                    if (!key.ok) {

                        return `
                        <div class="error">
                            Key ${key.index}:
                            ${key.error}
                        </div>
                        `;
                    }

                    const remaining =
                        key.remaining === null
                        ? "limit bilgisi yok"
                        : key.remaining +
                          " karakter kaldı";

                    return `
                    <div class="success">
                        Key ${key.index}:
                        ${key.tier}
                        ·
                        ${remaining}
                    </div>
                    `;

                })
                .join("");


        loadVoices();

    } catch (error) {

        $("status").textContent =
            "Sunucu hatası";

        $("status").className =
            "status error";
    }
}


async function loadVoices() {

    try {

        const response =
            await fetch(
                "/api/voices"
            );

        if (!response.ok) {
            return;
        }

        const data =
            await response.json();

        const voices =
            data.voices || [];


        $("voice").innerHTML =
            voices
                .map(voice => {

                    return `
                    <option
                        value="${voice.voice_id}"
                    >
                        ${voice.name}
                    </option>
                    `;

                })
                .join("");

    } catch (error) {

        console.error(error);
    }
}


$("generate").onclick =
async function () {

    const text =
        $("text")
            .value
            .trim();

    const voice =
        $("voice").value;


    if (!text) {

        $("message").textContent =
            "Metin gir knk.";

        return;
    }


    if (!voice) {

        $("message").textContent =
            "Bir ses seç.";

        return;
    }


    $("generate").disabled =
        true;

    $("message").textContent =
        "Üretiliyor...";


    const body = {

        text:
            text,

        voice_id:
            voice,

        model_id:
            $("model").value
    };


    if ($("stability").value) {

        body.stability =
            Number(
                $("stability").value
            );
    }


    if ($("similarity").value) {

        body.similarity_boost =
            Number(
                $("similarity").value
            );
    }


    try {

        const response =
            await fetch(
                "/api/generate",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                        "application/json"

                    },

                    body:
                        JSON.stringify(body)
                }
            );


        if (!response.ok) {

            const error =
                await response
                    .json()
                    .catch(
                        () => ({})
                    );

            throw new Error(
                error.detail ||
                "Üretim başarısız."
            );
        }


        const blob =
            await response.blob();


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href = url;

        link.download =
            "elevenlab.mp3";

        link.click();


        URL.revokeObjectURL(
            url
        );


        $("message").textContent =
            "Hazır. MP3 indirildi.";


        loadStatus();


    } catch (error) {

        $("message").textContent =
            error.message;

    } finally {

        $("generate").disabled =
            false;
    }
};


loadStatus();

</script>

</body>

</html>
"""

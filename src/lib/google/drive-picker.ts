const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

let pickerApiLoaded = false;
let gapiLoaded = false;

function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gapiLoaded) return resolve();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      gapiLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pickerApiLoaded) return resolve();
    window.gapi.load("picker", {
      callback: () => {
        pickerApiLoaded = true;
        resolve();
      },
      onerror: reject,
    });
  });
}

export interface DriveFileResult {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export async function openDrivePicker(
  accessToken: string
): Promise<DriveFileResult | null> {
  await loadGapiScript();
  await loadPickerApi();

  return new Promise((resolve) => {
    const view = new window.google.picker.DocsView(
      window.google.picker.ViewId.DOCS
    );
    view.setQuery("*.epub | *.pdf");
    view.setMode(window.google.picker.DocsViewMode.LIST);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
      .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID!)
      .setTitle("Select an EPUB or PDF file from Google Drive")
      .setCallback((data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }> }) => {
        if (data.action === window.google.picker.Action.PICKED && data.docs) {
          const file = data.docs[0];

          const lower = file.name.toLowerCase();
          if (!lower.endsWith(".epub") && !lower.endsWith(".pdf")) {
            alert("Please select an EPUB or PDF file.");
            resolve(null);
            return;
          }

          resolve({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes || 0,
          });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

declare global {
  interface Window {
    gapi: {
      load: (api: string, config: { callback: () => void; onerror: (e: unknown) => void }) => void;
    };
    google: {
      picker: {
        DocsView: new (viewId: string) => {
          setMimeTypes: (types: string) => void;
          setQuery: (query: string) => void;
          setMode: (mode: string) => void;
        };
        PickerBuilder: new () => {
          addView: (view: unknown) => ReturnType<typeof Object>;
          setOAuthToken: (token: string) => ReturnType<typeof Object>;
          setDeveloperKey: (key: string) => ReturnType<typeof Object>;
          setAppId: (id: string) => ReturnType<typeof Object>;
          setTitle: (title: string) => ReturnType<typeof Object>;
          setCallback: (cb: (data: unknown) => void) => ReturnType<typeof Object>;
          build: () => { setVisible: (v: boolean) => void };
        };
        ViewId: { DOCS: string };
        DocsViewMode: { LIST: string };
        Action: { PICKED: string; CANCEL: string };
      };
    };
  }
}

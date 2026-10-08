// Installs the addons an operator lists for a key, from a link like
// /#/?install=<key>. The list is install/<sha256 of key, hex>.json beside
// index.html, provided by whoever serves the build: a JSON object whose
// addons field is an array of manifest URLs. Naming the file by the hash
// lets the operator keep the key itself out of file names. Addons already
// in the profile are skipped, so opening the link again is harmless.

const React = require('react');
const { useLocation, useNavigate } = require('react-router');
const { useCore } = require('stremio/core');
const { withCoreSuspender, useProfile, useToast } = require('stremio/common');

const KEY = /^[A-Za-z0-9_-]+$/;

const sha256 = async (text) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const InstallKeyHandler = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const core = useCore();
    const profile = useProfile();
    const toast = useToast();
    const key = new URLSearchParams(location.search).get('install');
    const profileRef = React.useRef(profile);
    profileRef.current = profile;

    React.useEffect(() => {
        if (key === null) {
            return;
        }
        navigate({ pathname: location.pathname }, { replace: true });
        if (!KEY.test(key)) {
            return;
        }
        // The build is served with long cache lifetimes; the list must be fresh.
        const fetchJson = (url) => fetch(url, { cache: 'no-store' }).then((response) => {
            if (!response.ok) {
                throw new Error(`${url}: HTTP ${response.status}`);
            }
            return response.json();
        });
        sha256(key)
            .then((hash) => fetchJson(`install/${hash}.json`))
            .then(({ addons }) => {
                const installed = new Set(profileRef.current.addons.map(({ transportUrl }) => transportUrl));
                return Promise.all(addons.filter((url) => !installed.has(url)).map((url) =>
                    fetchJson(url).then((manifest) => {
                        core.transport.dispatch({
                            action: 'Ctx',
                            args: {
                                action: 'InstallAddon',
                                args: { manifest, transportUrl: url, flags: { official: false, protected: false } }
                            }
                        });
                    })
                ));
            })
            .catch((error) => {
                console.error('Install key failed:', error);
                toast.show({ type: 'error', title: 'Could not install the addons for this link', timeout: 10000 });
            });
    }, [key, location.pathname, navigate, core, toast]);

    return null;
};

module.exports = withCoreSuspender(InstallKeyHandler);

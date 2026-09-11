# Static site on a Red Hat UBI nginx image. Runs as an arbitrary non-root UID,
# which is what OpenShift's restricted-v2 SCC assigns, so no SCC changes needed.
FROM registry.access.redhat.com/ubi9/nginx-124:latest

COPY index.html                 /opt/app-root/src/
COPY css/                       /opt/app-root/src/css/
COPY js/                        /opt/app-root/src/js/

USER 1001
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

import { useRef, useEffect, useState } from "react";
import io from "socket.io-client";

// const socket = io("http://192.168.1.72:5174/");
const socket = io(import.meta.env.VITE_SOCKET_SERVER as string);

function VideoChat() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const [userRole, setUserRole] = useState<"A" | "B" | null>(null);

  const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Store early ICE candidates until remoteDescription is set
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const createPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(servers);

    // Send local tracks
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    };

    return pc;
  };

  const startConnection = async (role: "A" | "B") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      peerConnection.current = createPeerConnection(stream);

      if (role === "A") {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit("offer", offer);
      }
    } catch (err) {
      console.error("Error starting connection:", err);
    }
  };

  useEffect(() => {
    if (!userRole) return;

    // Auto-start connection after role is set
    startConnection(userRole);

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      if (userRole !== "B" || !peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("answer", answer);

      // Apply pending ICE candidates
      for (const candidate of pendingCandidates.current) {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
      pendingCandidates.current = [];
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      if (userRole !== "A" || !peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      // Apply pending ICE candidates
      for (const candidate of pendingCandidates.current) {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
      pendingCandidates.current = [];
    };

    const handleCandidate = async (candidate: RTCIceCandidateInit) => {
      if (!peerConnection.current) return;
      if (peerConnection.current.remoteDescription) {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } else {
        // Save until remoteDescription is set
        pendingCandidates.current.push(candidate);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleCandidate);

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleCandidate);
    };
  }, [userRole]);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>WebRTC Video Chat</h2>

      {!userRole && (
        <div>
          <button onClick={() => setUserRole("A")}>Join as User A</button>
          <button onClick={() => setUserRole("B")}>Join as User B</button>
        </div>
      )}

      {userRole && <p>You are User {userRole}</p>}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          width="300"
          style={{ border: "1px solid black", marginRight: 10 }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          width="300"
          style={{ border: "1px solid black" }}
        />
      </div>
    </div>
  );
}

export default VideoChat;

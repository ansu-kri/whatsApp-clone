import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useLoginMutation } from "../app/auth/authApi";
import { setCredentials } from "../app/auth/authSlice";
import toast from "react-hot-toast";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [login, { isLoading }] = useLoginMutation();

  const handleLogin = async () => {
    try {
      const res = await login({
        email,
        password,
      }).unwrap();

      // store token
      dispatch(
        setCredentials({
          token: res.access_token,
          user: {
            userId: "",
            email,
          },
        }),
      );

      toast.success("Login success");
      navigate("/chat");
    } catch (err: any) {
      const message = err?.data?.detail;

      console.log(err);

      // ❌ USER NOT FOUND → redirect to signup
      if (message === "Invalid email") {
        toast.error("User not found. Redirecting to signup...");

        setTimeout(() => {
          navigate("/signup");
        }, 1000);

        return;
      }

      // ❌ WRONG PASSWORD
      if (message === "Invalid password") {
        toast.error("Incorrect password");
        return;
      }

      toast.error("Login failed");
    }
  };

  return (
    <div className="h-screen flex justify-center items-center">
      <div className="w-[400px] shadow-lg p-5 rounded-lg">
        <h1 className="text-3xl font-bold mb-5">Login</h1>

        <input
          type="email"
          placeholder="Email"
          className="border w-full p-3 mb-3"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="border w-full p-3 mb-3"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="bg-black text-white w-full p-3 rounded"
        >
          {isLoading ? "Logging in..." : "Login"}
        </button>

        {/* 🔥 Extra UX */}
        <p className="text-sm text-center mt-3">
          New user?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => navigate("/signup")}
          >
            Signup
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;

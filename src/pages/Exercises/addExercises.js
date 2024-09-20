import React, { useState, useCallback, useContext } from "react";
import { getStorage, uploadBytes, ref, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import { motion } from "framer-motion";
import classes from "./AddExercises.module.scss";
import { AuthContext } from "../../components/data_fetch/authProvider";
import { RxCross2 } from "react-icons/rx";
import { database } from "../../firebase";
import { set, get, ref as dbRef, push } from "firebase/database";
import { Spinner } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

const AddExercises = ({ selectedExercise, onBackClick, clientId }) => {
  const { user } = useContext(AuthContext);
  const Navigate = useNavigate();
  const [thumbnail, setThumbnail] = useState(null);
  const [Exercise_Name, setTitle] = useState("");
  const [Preparation, setDescription] = useState("");
  const [Target, setMusclesInvolved] = useState("");
  const [duration, setDuration] = useState("");
  const [reps, setReps] = useState("");
  const [video, setVideo] = useState(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("Monday");
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const client = urlParams.get("client");
  const queryClient = useQueryClient();

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    setVideo(file);
  };

  const handleThumbnailChange = (e) => {
    const file = e.target.files[0];
    setThumbnail(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    if (clientId) {
      let clientRef;
      const res = await getDocs(
        query(collection(db, "Users"), where("userId", "==", clientId))
      );
      clientRef = res.docs[0].ref;
      const exercisename = Exercise_Name
        ? Exercise_Name
        : selectedExercise.Exercise_Name;
      const collectionRef = await getDocs(
        query(
          collection(clientRef, "exercises"),
          where("Exercise_Name", "==", exercisename)
        )
      );
      if (!collectionRef.empty) {
        setError("Exercise already assigned!");
        setSubmitting(false);
        return;
      }
    }
    // Step 1: Upload video to Firebase Storage
    const storage = getStorage();
    if (!video) {
      setError("Video cannot be empty");
      setSubmitting(false);
      return;
    }
    const videoRef = ref(storage, `exercise/${video.name}`);
    await uploadBytes(videoRef, video);

    if (!thumbnail) {
      setError("image cannot be empty");
      setSubmitting(false);
      return;
    }
    // Step 2: Upload thumbnail to Firebase Storage
    const thumbnailRef = ref(storage, `exercise/thumbnails/${thumbnail.name}`);
    await uploadBytes(thumbnailRef, thumbnail);

    // Step 3: Get the download URLs of the uploaded video and thumbnail
    const videoURL = await getDownloadURL(videoRef);
    const thumbnailURL = await getDownloadURL(thumbnailRef);

    // Step 4: Save exercise data to Firebase Firestore
    const exerciseData = selectedExercise
      ? {
          ...selectedExercise,
          videoURL,
          thumbnailURL,
          duration,
          reps,
          assignedDay: selectedPeriod,
          assignedOn: Timestamp.now(),
          physioId: user?.uid,
        }
      : {
          videoURL,
          thumbnailURL,
          Exercise_Name,
          Preparation,
          Target,
          duration,
          reps,
          assignedDay: selectedPeriod,
          assignedOn: Timestamp.now(),
          physioId: user?.uid,
        };

    const exerciseData1 = selectedExercise
      ? {
          ...selectedExercise,
          videoURL,
          thumbnailURL,
          Target: selectedExercise.Target ?? Target,
          assignedTo: [clientId],
          assignedOn: Timestamp.now(),
          physioId: user?.uid,
        }
      : {
          videoURL,
          thumbnailURL,
          Exercise_Name,
          Preparation,
          Target,
          assignedTo: clientId ? [clientId] : [],
          assignedOn: Timestamp.now(),
          physioId: user?.uid,
        };
    try {
      let clientRef = null;
      let docRef;
      if (clientId) {
        const res = await getDocs(
          query(collection(db, "Users"), where("userId", "==", clientId))
        );
        clientRef = res.docs[0].ref;

        docRef = await addDoc(collection(clientRef, "exercises"), exerciseData);

        const getPhysios = await getDocs(
          query(
            collection(db, "physiotherapist"),
            where("physiotherapistId", "==", user.uid)
          )
        );
        const physioDocId = getPhysios.docs[0].ref.id;
        await updateDoc(doc(db, "physiotherapist", physioDocId), {
          assignedOn: arrayUnion(Timestamp.now()),
        });

        //function to add exercise assigned to client in realtime database//
        const ex = {
          Exercise_Name: selectedExercise.Exercise_Name,
          assignedDay: selectedPeriod,
          id: docRef.id,
        };
        try {
          const exercisesRef = dbRef(database, "assignedExcercise/" + clientId);
          const snapshot = await get(exercisesRef);
          if (!snapshot.exists()) {
            await set(exercisesRef, { exercises: [] });
          }
          const exercisesRef1 = dbRef(
            database,
            `assignedExcercise/${clientId}/exercises`
          );
          const newExerciseRef = await push(exercisesRef1);
          //   const newExerciseId = newExerciseRef.key;

          //   await set(newExerciseRef,{exerciseData, id: docRef.id});
          await set(newExerciseRef, ex);
        } catch (error) {
          setError("Error assigning exercise on realtime database:", error);
        }
      }
      const response = await getDocs(
        query(
          collection(db, "exercises"),
          where("Exercise_Name", "in", [exerciseData1.Exercise_Name])
        )
      );
      if (response.empty) {
        await addDoc(collection(db, "exercises"), exerciseData1);
      } else {
        if (clientId) {
          const docid = response.docs[0].ref.id;
          await updateDoc(doc(db, "exercises", docid), {
            assignedTo: arrayUnion(clientId),
          });
        } else {
          setError("Exercise already exist!");
          setSubmitting(false);
          return;
        }
      }
      // Reset the form fields after successful upload
      setVideo(null);
      setThumbnail(null);
      setTitle("");
      setDescription("");
      setMusclesInvolved("");
      setDuration("");
      setReps("");
      setSuccess(true);
      setSubmitting(false);
      queryClient.invalidateQueries(["exercises"]);
      queryClient.invalidateQueries(["graphexercise"]);
    } catch (error) {
      setError(error);
      // console.error("Error adding exercise: ", error);
    }
  };

  //Handle Back Click
  const handleBackClick = () => {
    onBackClick();
  };

  const handleSuccess = () => {
    setSuccess(false);
    // clientId && window.location.replace("/Clients?client=" + clientId);
    Navigate(`/Clients/${clientId}/assignedExercise`);
  };

  return (
    <>
      <div className={classes.addExercises}>
        <div className={classes.header}>
          <p>Add Exercise</p>
        </div>

        <div className={classes.form}>
          <div className={classes.formElements}>
            <div className={classes.fieldName}>
              <p>Exercise Name</p>
            </div>
            <div className={classes.inputField}>
              <input
                value={
                  selectedExercise
                    ? selectedExercise.Exercise_Name
                    : Exercise_Name
                }
                type="text"
                // value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className={classes.formElements}>
            <div className={classes.fieldName}>
              <p>Duration</p>
            </div>
            <div className={classes.inputFieldSmall}>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className={classes.formElementsBig}>
            <div className={classes.fieldName}>
              <p>Exercise Description</p>
            </div>
            <div className={classes.inputFieldBig}>
              <textarea
                type="text"
                value={
                  selectedExercise
                    ? `Preparation: ${selectedExercise.Preparation} \n \nExecution: ${selectedExercise.Execution}`
                    : Preparation
                }
                // value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className={classes.formElements}>
            <div className={classes.fieldName}>
              <p>Muscles Involved</p>
            </div>
            <div className={classes.inputField}>
              <input
                type="text"
                // value={musclesInvolved}
                value={selectedExercise ? selectedExercise.Target : Target}
                onChange={(e) => setMusclesInvolved(e.target.value)}
              />
            </div>
          </div>

          <div className={classes.bottom}>
            <div className={classes.left}>
              {client && (
                <div className={classes.selectContainer}>
                  <div className={classes.fieldName}>
                    <p>Select a day</p>
                  </div>
                  <div className={classes.headerSelector}>
                    <select
                      className={classes.selector}
                      id="daySelector"
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>
                </div>
              )}
              <div className={classes.formElementsBottom}>
                <div className={classes.fieldName}>
                  <p>Repetitions</p>
                </div>
                <div className={classes.inputFieldSmall}>
                  <input
                    type="number"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                  />
                </div>
              </div>
              <div className={classes.footer}>
                <div className={classes.button} onClick={handleSubmit}>
                  <span>Submit</span>
                </div>

                <div className={classes.button} onClick={handleBackClick}>
                  <span>Back</span>
                </div>
              </div>
            </div>

            <div className={classes.right}>
              <div className={classes.video}>
                <div className={classes.field}>
                  <p>Add Video</p>
                </div>
                <div className={classes.videoContainer}>
                  {video ? (
                    <video
                      width={120}
                      height={100}
                      autoPlay
                      controls
                      src={URL.createObjectURL(video)}
                      alt={video.name}
                    />
                  ) : (
                    <label style={{ cursor: "pointer" }} htmlFor="video">
                      <AddCircleIcon fontSize="large" htmlColor="#497ef0" />
                    </label>
                  )}
                  <input
                    id="video"
                    style={{ display: "none" }}
                    type="file"
                    onChange={handleVideoChange}
                  />
                </div>
              </div>

              <div className={classes.image}>
                <div className={classes.field}>
                  <p>Add Image</p>
                </div>
                <div className={classes.imageContainer}>
                  {thumbnail ? (
                    <img
                      alt="#"
                      src={URL.createObjectURL(thumbnail)}
                      height={80}
                      loop
                      width={120}
                    />
                  ) : (
                    <label style={{ cursor: "pointer" }} htmlFor="image">
                      <AddCircleIcon fontSize="large" htmlColor="#497ef0" />
                    </label>
                  )}
                  <input
                    id="image"
                    style={{ display: "none" }}
                    type="file"
                    onChange={handleThumbnailChange}
                    placeholder="Thumbnail"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, x: [90, 0], scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className={classes.errorpopup}
          >
            <p>{error}</p>
            <div>
              <RxCross2
                color="white"
                size={20}
                onClick={() => {
                  setError(null);
                }}
              />
            </div>
          </motion.div>
        )}
      </div>
      {success ? (
        <div className={classes.successMsg}>
          <div className={classes.text}>
            <p>Exercise {clientId ? "Assigned" : "Added"} successfully</p>

            <div className={classes.button} onClick={handleSuccess}>
              <span>Done</span>
            </div>
          </div>
        </div>
      ) : (
        <></>
      )}
      {submitting && (
        <div className={classes.spinner}>
          <Spinner className={classes.spin} thickness="3px" />
        </div>
      )}
    </>
  );
};

export default AddExercises;
